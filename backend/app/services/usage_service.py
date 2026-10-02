import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from fastapi import HTTPException, status
from supabase import Client

logger = logging.getLogger("carepath.usage_service")

# Plan Limits
PLAN_AI_LIMITS = {
    "free": 3,
    "trial": 10,
    "premium": 50,
    "cancelled": 3,
    "expired": 3,
}

PLAN_DOCUMENT_LIMITS = {
    "free": 5,
    "trial": 20,
    "premium": 100,
    "cancelled": 5,
    "expired": 5,
}


class UsageService:
    """
    Server-side tracking of monthly AI analysis quotas and document allowances.
    Prevents calling AI providers when user quota is exhausted.
    """

    def __init__(self):
        # In-memory fallback if database table ai_usage has not been migrated yet
        self._in_memory_usage: Dict[str, Dict[str, int]] = {}

    def get_current_billing_period(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m")

    def check_ai_allowance(self, client: Client, patient_id: str, plan: str = "free") -> None:
        """
        Enforces monthly analysis limit server-side.
        Raises HTTP 403 with structured details if limit reached.
        """
        period = self.get_current_billing_period()
        limit = PLAN_AI_LIMITS.get(plan.lower(), 3)
        current_used = self._get_analysis_count(client, patient_id, period)

        if current_used >= limit:
            logger.info(f"AI allowance exhausted for patient {patient_id}: {current_used}/{limit} (plan: {plan})")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "AI_USAGE_LIMIT_REACHED",
                    "message": "Your monthly AI analysis limit has been reached.",
                    "used": current_used,
                    "limit": limit,
                    "upgrade_available": (plan.lower() != "premium"),
                },
            )

    def record_analysis_event(
        self,
        client: Client,
        patient_id: str,
        provider: str,
        successful: bool = True,
    ) -> None:
        """
        Records an analysis attempt server-side.
        """
        period = self.get_current_billing_period()
        try:
            # Query existing row in public.ai_usage
            res = (
                client.from_("ai_usage")
                .select("id, analysis_count, successful_analyses")
                .eq("patient_id", patient_id)
                .eq("billing_period", period)
                .maybe_single()
                .execute()
            )
            existing = res.data

            if existing:
                new_count = existing["analysis_count"] + 1
                new_success = existing["successful_analyses"] + (1 if successful else 0)
                client.from_("ai_usage").update({
                    "analysis_count": new_count,
                    "successful_analyses": new_success,
                    "provider": provider,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", existing["id"]).execute()
            else:
                client.from_("ai_usage").insert({
                    "patient_id": patient_id,
                    "billing_period": period,
                    "analysis_count": 1,
                    "successful_analyses": 1 if successful else 0,
                    "provider": provider,
                }).execute()

        except Exception as e:
            logger.warning(f"Database ai_usage update error ({str(e)}). Using in-memory tracking.")
            key = f"{patient_id}:{period}"
            if key not in self._in_memory_usage:
                self._in_memory_usage[key] = {"analysis_count": 0, "successful_analyses": 0}
            self._in_memory_usage[key]["analysis_count"] += 1
            if successful:
                self._in_memory_usage[key]["successful_analyses"] += 1

    def get_usage_summary(self, client: Client, patient_id: str, plan: str = "free") -> Dict[str, Any]:
        """
        Returns structured usage analytics for patient dashboard and subscription view.
        """
        period = self.get_current_billing_period()
        limit = PLAN_AI_LIMITS.get(plan.lower(), 3)
        doc_limit = PLAN_DOCUMENT_LIMITS.get(plan.lower(), 5)
        used = self._get_analysis_count(client, patient_id, period)

        return {
            "billing_period": period,
            "plan": plan,
            "ai_analyses_used": used,
            "ai_analyses_limit": limit,
            "ai_analyses_remaining": max(0, limit - used),
            "documents_limit": doc_limit,
            "upgrade_available": (plan.lower() != "premium"),
        }

    def _get_analysis_count(self, client: Client, patient_id: str, period: str) -> int:
        try:
            res = (
                client.from_("ai_usage")
                .select("analysis_count")
                .eq("patient_id", patient_id)
                .eq("billing_period", period)
                .maybe_single()
                .execute()
            )
            if res.data and "analysis_count" in res.data:
                return res.data["analysis_count"]
        except Exception:
            pass

        key = f"{patient_id}:{period}"
        return self._in_memory_usage.get(key, {}).get("analysis_count", 0)


usage_service = UsageService()
