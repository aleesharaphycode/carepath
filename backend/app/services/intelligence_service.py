import re
import logging
from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor
from supabase import Client
from app.schemas.intelligence import (
    TimelineEvent,
    TimelineResponse,
    CalendarEvent,
    CalendarResponse,
    MismatchItem,
    MismatchSourceInfo,
    MismatchResponse,
)

logger = logging.getLogger("carepath.intelligence")


class IntelligenceService:
    """
    Deterministic clinical intelligence service providing:
    1. Unified Health Timeline
    2. AI Health Calendar with deterministic projected date calculations
    3. Cross-Document Information Mismatch Detection with bidirectional provenance
    """

    def _get_document_map(self, client: Client, patient_id: str) -> Dict[str, Dict[str, Any]]:
        """Retrieves mapping of document_id -> document metadata for patient."""
        res = (
            client.from_("documents")
            .select("id, file_name, file_type, document_type, uploaded_at")
            .eq("patient_id", patient_id)
            .execute()
        )
        return {doc["id"]: doc for doc in (res.data or [])}

    def _get_document_dates(self, client: Client, patient_id: str) -> Dict[str, str]:
        """Retrieves best-known date for each document (from extractions or uploaded_at)."""
        extractions = (
            client.from_("document_extractions")
            .select("document_id, document_date")
            .eq("patient_id", patient_id)
            .execute()
        )
        dates = {}
        for row in extractions.data or []:
            if row.get("document_date"):
                dates[row["document_id"]] = row["document_date"]

        docs = client.from_("documents").select("id, uploaded_at").eq("patient_id", patient_id).execute()
        for doc in docs.data or []:
            if doc["id"] not in dates and doc.get("uploaded_at"):
                # fallback to upload date YYYY-MM-DD
                dates[doc["id"]] = doc["uploaded_at"][:10]
        return dates

    def _format_date(self, raw_date: Optional[str]) -> tuple[Optional[str], str, bool]:
        """
        Normalizes a date string into (iso_date, display_text, is_confirmed).
        If raw_date is empty, returns (None, 'Date not specified', False).
        """
        if not raw_date or not str(raw_date).strip() or str(raw_date).lower() in ["null", "none", "unknown"]:
            return None, "Date not specified", False

        clean_str = str(raw_date).strip()
        # Check standard ISO YYYY-MM-DD
        iso_match = re.search(r"(\d{4})-(\d{2})-(\d{2})", clean_str)
        if iso_match:
            try:
                dt = datetime.strptime(iso_match.group(0), "%Y-%m-%d").date()
                return dt.strftime("%Y-%m-%d"), dt.strftime("%b %d, %Y"), True
            except ValueError:
                pass

        # Check DD/MM/YYYY or MM/DD/YYYY
        slash_match = re.search(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", clean_str)
        if slash_match:
            try:
                p1, p2, yr = int(slash_match.group(1)), int(slash_match.group(2)), int(slash_match.group(3))
                # Attempt DD/MM/YYYY first
                if p2 <= 12 and p1 <= 31:
                    dt = date(yr, p2, p1)
                    return dt.strftime("%Y-%m-%d"), dt.strftime("%b %d, %Y"), True
            except ValueError:
                pass

        # Return literal string as display, but cannot guarantee ISO sorting
        return None, clean_str, True

    def _parse_relative_duration(self, base_date: date, relative_text: str) -> Optional[date]:
        """
        Deterministic calculation of future date from relative timeframe.
        Never invokes AI or makes speculative estimates.
        """
        if not relative_text:
            return None

        clean = relative_text.lower().strip()
        match = re.search(r"(\d+)\s*(day|week|month|year)", clean)
        if not match:
            # Word-based numbers: "one month", "two weeks", "three months", "six months"
            word_map = {"one": 1, "two": 2, "three": 3, "four": 4, "six": 6, "twelve": 12}
            word_match = re.search(r"(one|two|three|four|six|twelve)\s*(day|week|month|year)", clean)
            if word_match:
                num = word_map[word_match.group(1)]
                unit = word_match.group(2)
            else:
                return None
        else:
            num = int(match.group(1))
            unit = match.group(2)

        try:
            if unit.startswith("day"):
                return base_date + timedelta(days=num)
            elif unit.startswith("week"):
                return base_date + timedelta(weeks=num)
            elif unit.startswith("month"):
                month_idx = base_date.month - 1 + num
                new_year = base_date.year + (month_idx // 12)
                new_month = (month_idx % 12) + 1
                new_day = min(base_date.day, 28)
                return date(new_year, new_month, new_day)
            elif unit.startswith("year"):
                return date(base_date.year + num, base_date.month, min(base_date.day, 28))
        except Exception as e:
            logger.warning(f"Error calculating relative duration for '{relative_text}': {e}")
            return None
        return None

    # =========================================================================
    # 1. UNIFIED HEALTH TIMELINE
    # =========================================================================
    def get_timeline(self, client: Client, patient_id: str) -> TimelineResponse:
        """
        Aggregates diagnoses, medications, investigations, procedures, and follow-ups
        into a unified, chronologically sorted health journey.
        Executes independent Supabase queries concurrently to eliminate sequential network waterfalls.
        """
        with ThreadPoolExecutor(max_workers=6) as executor:
            f_docs = executor.submit(lambda: self._get_document_map(client, patient_id))
            f_diag = executor.submit(lambda: client.from_("diagnoses").select("*").eq("patient_id", patient_id).execute())
            f_med = executor.submit(lambda: client.from_("medications").select("*").eq("patient_id", patient_id).execute())
            f_inv = executor.submit(lambda: client.from_("investigations").select("*").eq("patient_id", patient_id).execute())
            f_proc = executor.submit(lambda: client.from_("procedures").select("*").eq("patient_id", patient_id).execute())
            f_fol = executor.submit(lambda: client.from_("follow_ups").select("*").eq("patient_id", patient_id).execute())

            doc_map = f_docs.result()
            diag_res = f_diag.result()
            med_res = f_med.result()
            inv_res = f_inv.result()
            proc_res = f_proc.result()
            fol_res = f_fol.result()

        events: List[TimelineEvent] = []
        categories = {
            "diagnoses": 0,
            "medications": 0,
            "investigations": 0,
            "procedures": 0,
            "follow_ups": 0,
        }

        # 1. Diagnoses
        for d in diag_res.data or []:
            categories["diagnoses"] += 1
            doc_info = doc_map.get(d["document_id"], {})
            iso_date, display_date, is_confirmed = self._format_date(d.get("date"))
            events.append(
                TimelineEvent(
                    id=f"diag-{d['id']}",
                    event_type="diagnosis",
                    title=d["name"],
                    date=iso_date,
                    date_display=display_date,
                    is_date_confirmed=is_confirmed,
                    details={
                        "status": d.get("status") or "active",
                        "condition": d["name"],
                    },
                    document_id=d["document_id"],
                    document_name=doc_info.get("file_name", "Medical Document"),
                    source_page=d.get("source_page"),
                    source_text=d.get("source_text") or "Diagnosis documented in record.",
                    confidence_note=d.get("confidence_note"),
                )
            )

        # 2. Medications
        for m in med_res.data or []:
            categories["medications"] += 1
            doc_info = doc_map.get(m["document_id"], {})
            iso_date, display_date, is_confirmed = self._format_date(m.get("start_date"))
            dose_str = f"{m.get('dose') or ''} {m.get('frequency') or ''}".strip()
            events.append(
                TimelineEvent(
                    id=f"med-{m['id']}",
                    event_type="medication",
                    title=f"{m['name']} {m.get('dose') or ''}".strip(),
                    date=iso_date,
                    date_display=display_date,
                    is_date_confirmed=is_confirmed,
                    details={
                        "medication_name": m["name"],
                        "dose": m.get("dose"),
                        "route": m.get("route"),
                        "frequency": m.get("frequency"),
                        "duration": m.get("duration"),
                        "instructions": m.get("instructions"),
                        "end_date": m.get("end_date"),
                        "summary": dose_str or "Prescription recorded",
                    },
                    document_id=m["document_id"],
                    document_name=doc_info.get("file_name", "Prescription"),
                    source_page=m.get("source_page"),
                    source_text=m.get("source_text") or "Medication prescribed in document.",
                    confidence_note=m.get("confidence_note"),
                )
            )

        # 3. Investigations
        for i in inv_res.data or []:
            categories["investigations"] += 1
            doc_info = doc_map.get(i["document_id"], {})
            iso_date, display_date, is_confirmed = self._format_date(i.get("date"))
            res_str = f"{i.get('result') or ''} {i.get('unit') or ''}".strip()
            events.append(
                TimelineEvent(
                    id=f"inv-{i['id']}",
                    event_type="investigation",
                    title=i["name"],
                    date=iso_date,
                    date_display=display_date,
                    is_date_confirmed=is_confirmed,
                    details={
                        "test_name": i["name"],
                        "result": i.get("result"),
                        "unit": i.get("unit"),
                        "reference_range": i.get("reference_range"),
                        "abnormal_flag": bool(i.get("abnormal_flag")),
                        "result_summary": res_str or "Test completed",
                    },
                    document_id=i["document_id"],
                    document_name=doc_info.get("file_name", "Lab Report"),
                    source_page=i.get("source_page"),
                    source_text=i.get("source_text") or "Laboratory findings documented.",
                    confidence_note=i.get("confidence_note"),
                )
            )

        # 4. Procedures
        for p in proc_res.data or []:
            categories["procedures"] += 1
            doc_info = doc_map.get(p["document_id"], {})
            iso_date, display_date, is_confirmed = self._format_date(p.get("date"))
            events.append(
                TimelineEvent(
                    id=f"proc-{p['id']}",
                    event_type="procedure",
                    title=p["name"],
                    date=iso_date,
                    date_display=display_date,
                    is_date_confirmed=is_confirmed,
                    details={
                        "procedure_name": p["name"],
                        "details": p.get("details"),
                    },
                    document_id=p["document_id"],
                    document_name=doc_info.get("file_name", "Procedure Record"),
                    source_page=p.get("source_page"),
                    source_text=p.get("source_text") or "Clinical procedure recorded.",
                    confidence_note=p.get("confidence_note"),
                )
            )

        # 5. Follow-ups
        for f in fol_res.data or []:
            categories["follow_ups"] += 1
            doc_info = doc_map.get(f["document_id"], {})
            iso_date, display_date, is_confirmed = self._format_date(f.get("confirmed_date"))
            if not is_confirmed and f.get("relative_time"):
                display_date = f"Timeframe: {f['relative_time']}"

            events.append(
                TimelineEvent(
                    id=f"fol-{f['id']}",
                    event_type="follow_up",
                    title=f["description"],
                    date=iso_date,
                    date_display=display_date,
                    is_date_confirmed=is_confirmed,
                    details={
                        "description": f["description"],
                        "relative_time": f.get("relative_time"),
                        "confirmed_date": f.get("confirmed_date"),
                    },
                    document_id=f["document_id"],
                    document_name=doc_info.get("file_name", "Clinical Review"),
                    source_page=f.get("source_page"),
                    source_text=f.get("source_text") or "Follow-up instructions given.",
                    confidence_note=f.get("confidence_note"),
                )
            )

        # Sort chronologically: confirmed dates descending (most recent first),
        # unconfirmed dates placed at the end without fabricating dates.
        dated_events = [e for e in events if e.date is not None]
        undated_events = [e for e in events if e.date is None]

        dated_events.sort(key=lambda x: x.date, reverse=True)
        # Undated events can be sorted by title
        undated_events.sort(key=lambda x: x.title)

        ordered_events = dated_events + undated_events

        return TimelineResponse(
            events=ordered_events,
            total_count=len(ordered_events),
            categories=categories,
        )

    # =========================================================================
    # 2. AI HEALTH CALENDAR
    # =========================================================================
    def get_calendar(self, client: Client, patient_id: str) -> CalendarResponse:
        """
        Builds healthcare calendar from confirmed dates and deterministically
        calculated relative intervals. Strict visual and semantic distinction
        between confirmed clinical dates and AI-derived / projected dates.
        Executes independent Supabase queries concurrently to eliminate sequential network waterfalls.
        """
        with ThreadPoolExecutor(max_workers=5) as executor:
            f_docs = executor.submit(lambda: self._get_document_map(client, patient_id))
            f_dates = executor.submit(lambda: self._get_document_dates(client, patient_id))
            f_he = executor.submit(lambda: client.from_("health_events").select("*").eq("patient_id", patient_id).execute())
            f_fol = executor.submit(lambda: client.from_("follow_ups").select("*").eq("patient_id", patient_id).execute())
            f_proc = executor.submit(lambda: client.from_("procedures").select("*").eq("patient_id", patient_id).execute())

            doc_map = f_docs.result()
            doc_dates = f_dates.result()
            try:
                he_res = f_he.result()
            except Exception as e:
                logger.warning(f"Could not load health_events in get_calendar: {e}")
                he_res = None
            fol_res = f_fol.result()
            proc_res = f_proc.result()

        events: List[CalendarEvent] = []
        confirmed_count = 0
        projected_count = 0

        # 0. Primary Confirmed & Planned Health Events (from public.health_events)
        if he_res:
            for he in he_res.data or []:
                doc_info = doc_map.get(he.get("document_id"), {})
                iso_date = he.get("event_date")
                status_val = he.get("status", "completed")
                is_planned = (status_val == "planned")

                display_date = iso_date
                if iso_date:
                    try:
                        dt = datetime.strptime(str(iso_date)[:10], "%Y-%m-%d")
                        display_date = dt.strftime("%b %d, %Y")
                        if is_planned:
                            display_date = f"Planned: {display_date}"
                    except Exception:
                        pass

                if is_planned:
                    projected_count += 1
                else:
                    confirmed_count += 1

                events.append(
                    CalendarEvent(
                        id=f"he-{he['id']}",
                        event_type=he.get("event_type", "visit"),
                        title=he.get("title") or "Healthcare Event",
                        date=str(iso_date) if iso_date else None,
                        date_display=display_date or "Scheduled Date",
                        is_projected=is_planned,
                        relative_time_text=None,
                        projection_basis="Planned healthcare appointment" if is_planned else "Confirmed healthcare event date",
                        document_id=he.get("document_id"),
                        document_name=doc_info.get("file_name"),
                        source_page=None,
                        source_text=he.get("description") or "Healthcare event",
                        confidence_note="Confirmed healthcare event",
                        status=status_val,
                        doctor_name=he.get("doctor_name"),
                        clinic_name=he.get("clinic_name"),
                        location=he.get("location"),
                        description=he.get("description"),
                    )
                )

        # Follow-ups (Primary source of appointments and review dates)
        for f in fol_res.data or []:
            doc_info = doc_map.get(f["document_id"], {})
            confirmed_date = f.get("confirmed_date")
            relative_time = f.get("relative_time")

            if confirmed_date:
                # 1. Confirmed calendar date
                iso_date, display_date, is_confirmed = self._format_date(confirmed_date)
                confirmed_count += 1
                events.append(
                    CalendarEvent(
                        id=f"cal-fol-conf-{f['id']}",
                        event_type="follow_up",
                        title=f["description"],
                        date=iso_date,
                        date_display=display_date,
                        is_projected=False,
                        relative_time_text=None,
                        projection_basis="Confirmed clinical appointment date",
                        document_id=f["document_id"],
                        document_name=doc_info.get("file_name", "Clinical Follow-up"),
                        source_page=f.get("source_page"),
                        source_text=f.get("source_text") or "Confirmed appointment in document.",
                        confidence_note=f.get("confidence_note"),
                    )
                )

            elif relative_time:
                # 2. Relative timeframe -> Deterministic date projection
                base_date_str = doc_dates.get(f["document_id"])
                base_dt = None
                if base_date_str:
                    try:
                        base_dt = datetime.strptime(base_date_str[:10], "%Y-%m-%d").date()
                    except ValueError:
                        base_dt = None

                projected_dt = None
                if base_dt:
                    projected_dt = self._parse_relative_duration(base_dt, relative_time)

                if projected_dt:
                    projected_count += 1
                    events.append(
                        CalendarEvent(
                            id=f"cal-fol-proj-{f['id']}",
                            event_type="follow_up",
                            title=f["description"],
                            date=projected_dt.strftime("%Y-%m-%d"),
                            date_display=f"Projected: {projected_dt.strftime('%b %d, %Y')}",
                            is_projected=True,
                            relative_time_text=f"Relative timeframe: {relative_time}",
                            projection_basis=f"Deterministically calculated from encounter date ({base_dt.strftime('%b %d, %Y')}) + '{relative_time}'",
                            document_id=f["document_id"],
                            document_name=doc_info.get("file_name", "Clinical Follow-up"),
                            source_page=f.get("source_page"),
                            source_text=f.get("source_text") or f"Relative review: {relative_time}",
                            confidence_note="Projected Date: Verify exact scheduling with healthcare provider.",
                        )
                    )
                else:
                    # Unscheduled relative timeframe
                    projected_count += 1
                    events.append(
                        CalendarEvent(
                            id=f"cal-fol-unsched-{f['id']}",
                            event_type="follow_up",
                            title=f["description"],
                            date=None,
                            date_display=f"Timeframe: {relative_time} (Unscheduled)",
                            is_projected=True,
                            relative_time_text=f"Relative timeframe: {relative_time}",
                            projection_basis="Relative interval specified without base encounter date",
                            document_id=f["document_id"],
                            document_name=doc_info.get("file_name", "Clinical Follow-up"),
                            source_page=f.get("source_page"),
                            source_text=f.get("source_text") or f"Relative review: {relative_time}",
                            confidence_note="Requires patient or clinician confirmation.",
                        )
                    )

        # Include confirmed procedures and investigation test dates as milestones
        for p in proc_res.data or []:
            if p.get("date"):
                iso_date, display_date, is_confirmed = self._format_date(p.get("date"))
                if is_confirmed and iso_date:
                    confirmed_count += 1
                    doc_info = doc_map.get(p["document_id"], {})
                    events.append(
                        CalendarEvent(
                            id=f"cal-proc-{p['id']}",
                            event_type="procedure",
                            title=f"Procedure: {p['name']}",
                            date=iso_date,
                            date_display=display_date,
                            is_projected=False,
                            relative_time_text=None,
                            projection_basis="Documented procedure date",
                            document_id=p["document_id"],
                            document_name=doc_info.get("file_name", "Procedure Report"),
                            source_page=p.get("source_page"),
                            source_text=p.get("source_text") or "Documented procedure.",
                            confidence_note=p.get("confidence_note"),
                        )
                    )

        # Sort calendar events chronologically by date
        dated = [e for e in events if e.date is not None]
        undated = [e for e in events if e.date is None]

        dated.sort(key=lambda x: x.date)
        ordered_events = dated + undated

        return CalendarResponse(
            events=ordered_events,
            total_events=len(ordered_events),
            confirmed_count=confirmed_count,
            projected_count=projected_count,
        )

    # =========================================================================
    # 3. CROSS-DOCUMENT INFORMATION MISMATCH DETECTION
    # =========================================================================
    def get_mismatches(self, client: Client, patient_id: str) -> MismatchResponse:
        """
        Executes deterministic cross-document consistency checks across structured records.
        Identifies potential mismatches (medication dosage differences, anatomical sites,
        tooth numbers, and procedure inconsistencies).
        NEVER claims a doctor made an error or asserts which record is correct.
        Executes independent Supabase queries concurrently to eliminate sequential network waterfalls.
        """
        with ThreadPoolExecutor(max_workers=5) as executor:
            f_docs = executor.submit(lambda: self._get_document_map(client, patient_id))
            f_meds = executor.submit(lambda: client.from_("medications").select("*").eq("patient_id", patient_id).execute())
            f_proc = executor.submit(lambda: client.from_("procedures").select("*").eq("patient_id", patient_id).execute())
            f_ext = executor.submit(lambda: client.from_("document_extractions").select("document_id, clinical_notes, raw_extraction").eq("patient_id", patient_id).execute())
            f_db_mis = executor.submit(lambda: client.from_("cross_document_mismatches").select("*").eq("patient_id", patient_id).execute())

            doc_map = f_docs.result()
            meds_res = f_meds.result()
            proc_res = f_proc.result()
            ext_res = f_ext.result()
            try:
                db_mismatches_res = f_db_mis.result()
            except Exception as e:
                logger.info(f"Dynamic mismatch detection active (DB table query skipped: {e})")
                db_mismatches_res = None

        mismatches: List[MismatchItem] = []

        # ---------------------------------------------------------------------
        # A. Medication Dosages & Frequencies Across Documents
        # ---------------------------------------------------------------------
        meds_by_name: Dict[str, List[Dict[str, Any]]] = {}

        for m in meds_res.data or []:
            # Normalize medication name (strip salt/delivery, lowercase)
            norm_name = re.sub(r"[^a-zA-Z0-9\s]", "", m["name"].lower()).strip()
            # extract primary brand/drug token
            token = norm_name.split()[0] if norm_name else ""
            if len(token) >= 3:
                meds_by_name.setdefault(token, []).append(m)

        for token, group in meds_by_name.items():
            if len(group) < 2:
                continue

            # Compare pairs across different source documents
            for i in range(len(group)):
                for j in range(i + 1, len(group)):
                    med_a = group[i]
                    med_b = group[j]

                    if med_a["document_id"] == med_b["document_id"]:
                        continue  # Must be cross-document

                    dose_a = (med_a.get("dose") or "").strip().lower()
                    dose_b = (med_b.get("dose") or "").strip().lower()

                    # Normalize numbers for dose comparison (e.g. 500mg vs 250mg)
                    num_a = re.findall(r"\d+", dose_a)
                    num_b = re.findall(r"\d+", dose_b)

                    if num_a and num_b and num_a != num_b:
                        doc_a_name = doc_map.get(med_a["document_id"], {}).get("file_name", "Source Record A")
                        doc_b_name = doc_map.get(med_b["document_id"], {}).get("file_name", "Source Record B")

                        mismatches.append(
                            MismatchItem(
                                id=f"mismatch-med-{med_a['id'][:8]}-{med_b['id'][:8]}",
                                category="medication",
                                title=f"Medication Dosage Difference: {med_a['name'].title()}",
                                field_name="dosage",
                                source_a=MismatchSourceInfo(
                                    document_id=med_a["document_id"],
                                    document_name=doc_a_name,
                                    source_page=med_a.get("source_page"),
                                    source_text=med_a.get("source_text") or f"{med_a['name']} {med_a.get('dose')}",
                                    value=med_a.get("dose") or "Unspecified dose",
                                ),
                                source_b=MismatchSourceInfo(
                                    document_id=med_b["document_id"],
                                    document_name=doc_b_name,
                                    source_page=med_b.get("source_page"),
                                    source_text=med_b.get("source_text") or f"{med_b['name']} {med_b.get('dose')}",
                                    value=med_b.get("dose") or "Unspecified dose",
                                ),
                                explanation=(
                                    f"Different dosages ({med_a.get('dose')} vs {med_b.get('dose')}) "
                                    f"were found across two source records for {med_a['name']}. "
                                    f"Verify against the original documents."
                                ),
                                verification_message="Potential Information Mismatch — Verify against original source.",
                            )
                        )

        # ---------------------------------------------------------------------
        # B. Anatomical References / Tooth Numbers / Surgical Sites
        # (Explicit requirement in prompt: Tooth #36 vs Tooth #37)
        # ---------------------------------------------------------------------
        # Inspect procedures, follow_ups, and extractions for anatomical identifiers
        dental_regex = re.compile(r"(?:tooth|teeth|#|no\.?)\s*(?:#)?\s*(\d{1,2})", re.IGNORECASE)

        # Collect tooth references per document
        dental_refs: List[Dict[str, Any]] = []

        # Check procedures (using prefetched concurrent proc_res)
        for p in proc_res.data or []:
            combined_text = f"{p['name']} {p.get('details') or ''} {p.get('source_text') or ''}"
            matches = dental_regex.findall(combined_text)
            for tooth in set(matches):
                dental_refs.append({
                    "tooth": tooth,
                    "document_id": p["document_id"],
                    "source_page": p.get("source_page"),
                    "source_text": p.get("source_text") or p["name"],
                    "entity_type": "Procedure",
                    "title": p["name"],
                })

        # Check raw extractions clinical notes for tooth references (using prefetched concurrent ext_res)
        for ext in ext_res.data or []:
            notes = ext.get("clinical_notes") or ""
            matches = dental_regex.findall(notes)
            for tooth in set(matches):
                dental_refs.append({
                    "tooth": tooth,
                    "document_id": ext["document_id"],
                    "source_page": None,
                    "source_text": notes[:200],
                    "entity_type": "Clinical Record",
                    "title": f"Treatment reference to Tooth #{tooth}",
                })

        # Compare dental tooth references across different documents
        if len(dental_refs) >= 2:
            seen_pairs = set()
            for i in range(len(dental_refs)):
                for j in range(i + 1, len(dental_refs)):
                    ref_a = dental_refs[i]
                    ref_b = dental_refs[j]

                    if ref_a["document_id"] == ref_b["document_id"]:
                        continue

                    # If tooth numbers differ
                    if ref_a["tooth"] != ref_b["tooth"]:
                        pair_key = tuple(sorted([f"{ref_a['document_id']}:{ref_a['tooth']}", f"{ref_b['document_id']}:{ref_b['tooth']}"]))
                        if pair_key in seen_pairs:
                            continue
                        seen_pairs.add(pair_key)

                        doc_a_name = doc_map.get(ref_a["document_id"], {}).get("file_name", "Record A")
                        doc_b_name = doc_map.get(ref_b["document_id"], {}).get("file_name", "Record B")

                        mismatches.append(
                            MismatchItem(
                                id=f"mismatch-tooth-{ref_a['tooth']}-{ref_b['tooth']}",
                                category="anatomical_site",
                                title=f"Anatomical Site / Tooth Reference Difference: Tooth #{ref_a['tooth']} vs Tooth #{ref_b['tooth']}",
                                field_name="tooth_number",
                                source_a=MismatchSourceInfo(
                                    document_id=ref_a["document_id"],
                                    document_name=doc_a_name,
                                    source_page=ref_a.get("source_page"),
                                    source_text=ref_a["source_text"],
                                    value=f"Tooth #{ref_a['tooth']}",
                                ),
                                source_b=MismatchSourceInfo(
                                    document_id=ref_b["document_id"],
                                    document_name=doc_b_name,
                                    source_page=ref_b.get("source_page"),
                                    source_text=ref_b["source_text"],
                                    value=f"Tooth #{ref_b['tooth']}",
                                ),
                                explanation=(
                                    f"Different tooth numbers (Tooth #{ref_a['tooth']} vs Tooth #{ref_b['tooth']}) "
                                    f"were found in two source records. Verify against the original documents."
                                ),
                                verification_message="Potential Information Mismatch — Verify against original source.",
                            )
                        )

        # ---------------------------------------------------------------------
        # C. Check for existing persisted mismatches in database if table exists
        # ---------------------------------------------------------------------
        if db_mismatches_res and db_mismatches_res.data:
            for row in db_mismatches_res.data:
                # check if not already added by id
                if not any(m.id == row["id"] for m in mismatches):
                    doc_a_name = doc_map.get(row.get("source_a_document_id"), {}).get("file_name", "Document A")
                    doc_b_name = doc_map.get(row.get("source_b_document_id"), {}).get("file_name", "Document B")
                    mismatches.append(
                        MismatchItem(
                            id=row["id"],
                            category=row["category"],
                            title=row["title"],
                            field_name=row["field_name"],
                            source_a=MismatchSourceInfo(
                                document_id=row.get("source_a_document_id") or "",
                                document_name=doc_a_name,
                                source_page=row.get("source_a_page"),
                                source_text=row.get("source_a_text") or "",
                                value=row["source_a_value"],
                            ),
                            source_b=MismatchSourceInfo(
                                document_id=row.get("source_b_document_id") or "",
                                document_name=doc_b_name,
                                source_page=row.get("source_b_page"),
                                source_text=row.get("source_b_text") or "",
                                value=row["source_b_value"],
                            ),
                            explanation=row["explanation"],
                            verification_message=row.get("verification_message") or "Potential Information Mismatch — Verify against original source.",
                            status=row.get("status", "flagged"),
                            created_at=row.get("created_at"),
                        )
                    )

        return MismatchResponse(
            mismatches=mismatches,
            total_count=len(mismatches),
        )


intelligence_service = IntelligenceService()
