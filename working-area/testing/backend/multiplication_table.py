"""Print the multiplication table (1-10) for a number entered by the user."""

from __future__ import annotations


def multiplication_table(number: int, upto: int = 10) -> list[str]:
    """Return the multiplication table rows for ``number`` up to ``upto``.

    Args:
        number: The number whose table should be generated.
        upto: The largest multiplier to include (default 10).

    Returns:
        A list of formatted strings, e.g. ``"7 x 3 = 21"``.
    """
    if upto < 1:
        raise ValueError("upto must be at least 1")
    return [f"{number} x {i} = {number * i}" for i in range(1, upto + 1)]


def main() -> None:
    """Prompt the user for a number and print its multiplication table."""
    while True:
        raw = input("Enter a number: ").strip()
        try:
            number = int(raw)
        except ValueError:
            print("Invalid input. Please enter a valid integer.")
            continue
        break

    for row in multiplication_table(number):
        print(row)


if __name__ == "__main__":
    main()
