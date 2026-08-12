"""Tests for multiplication_table."""

import unittest

from multiplication_table import multiplication_table


class MultiplicationTableTests(unittest.TestCase):
    def test_table_of_7(self) -> None:
        rows = multiplication_table(7)
        self.assertEqual(len(rows), 10)
        self.assertEqual(rows[0], "7 x 1 = 7")
        self.assertEqual(rows[9], "7 x 10 = 70")

    def test_custom_range(self) -> None:
        rows = multiplication_table(5, upto=3)
        self.assertEqual(rows, ["5 x 1 = 5", "5 x 2 = 10", "5 x 3 = 15"])

    def test_zero(self) -> None:
        self.assertEqual(multiplication_table(0)[0], "0 x 1 = 0")

    def test_invalid_range(self) -> None:
        with self.assertRaises(ValueError):
            multiplication_table(2, upto=0)


if __name__ == "__main__":
    unittest.main()
