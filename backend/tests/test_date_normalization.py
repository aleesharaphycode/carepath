import unittest
from datetime import datetime, date
from app.utils.date_utils import normalize_date


class TestDateNormalization(unittest.TestCase):
    """
    Test suite for centralized date normalization utility.
    Ensures safe parsing and conversion across various medical document date formats.
    """

    def test_explicit_user_required_formats(self):
        """Verify the exact conversion formats required by CarePath specifications."""
        self.assertEqual(normalize_date("24/06/2023"), "2023-06-24")
        self.assertEqual(normalize_date("24-06-2023"), "2023-06-24")
        self.assertEqual(normalize_date("24.06.2023"), "2023-06-24")
        self.assertEqual(normalize_date("2023/06/24"), "2023-06-24")
        self.assertEqual(normalize_date("2023-06-24"), "2023-06-24")

    def test_timestamps_and_datetimes(self):
        """Verify dates accompanied by timestamps or within ISO strings are normalized."""
        self.assertEqual(normalize_date("2023-06-24 08:49 PM"), "2023-06-24")
        self.assertEqual(normalize_date("24/06/2023 08:49 PM"), "2023-06-24")
        self.assertEqual(normalize_date("24-06-2023 14:30:00"), "2023-06-24")
        self.assertEqual(normalize_date("2023-06-24T12:00:00Z"), "2023-06-24")

    def test_textual_dates(self):
        """Verify natural language textual dates are correctly formatted."""
        self.assertEqual(normalize_date("24 June 2023"), "2023-06-24")
        self.assertEqual(normalize_date("June 24, 2023"), "2023-06-24")
        self.assertEqual(normalize_date("24 Jun 2023"), "2023-06-24")

    def test_single_digit_days_and_months(self):
        """Verify dates without leading zeroes normalize to 2-digit ISO dates."""
        self.assertEqual(normalize_date("4/6/2023"), "2023-06-04")
        self.assertEqual(normalize_date("24/6/2023"), "2023-06-24")

    def test_datetime_and_date_objects(self):
        """Verify datetime and date instances are formatted directly."""
        self.assertEqual(normalize_date(date(2023, 6, 24)), "2023-06-24")
        self.assertEqual(normalize_date(datetime(2023, 6, 24, 20, 49)), "2023-06-24")

    def test_null_empty_invalid_handled_safely(self):
        """Verify null, empty, whitespace, and invalid strings return None without raising."""
        self.assertIsNone(normalize_date(None))
        self.assertIsNone(normalize_date(""))
        self.assertIsNone(normalize_date("   "))
        self.assertIsNone(normalize_date("None"))
        self.assertIsNone(normalize_date("null"))
        self.assertIsNone(normalize_date("N/A"))
        self.assertIsNone(normalize_date("unknown"))
        self.assertIsNone(normalize_date("invalid_date_text"))
        self.assertIsNone(normalize_date("32/01/2023"))
        self.assertIsNone(normalize_date("2023-02-30"))


if __name__ == "__main__":
    unittest.main()
