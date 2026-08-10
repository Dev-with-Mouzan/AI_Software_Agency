"""Unit tests for the safe expression evaluator."""

import pytest

from app.calculator import CalculationError, evaluate


@pytest.mark.parametrize(
    "expression,expected",
    [
        ("2 + 2", 4),
        ("2+3*4", 14),
        ("(2 + 3) * 4", 20),
        ("7 / 2", 3.5),
        ("8 // 3", 2),
        ("10 % 3", 1),
        ("2 ** 10", 1024),
        ("-5 + 3", -2),
        ("+5", 5),
        ("3.5 * 2", 7.0),
        ("sqrt(16)", 4),
        ("sqrt(2) * sqrt(2)", 2),
        ("abs(-4.5)", 4.5),
        ("pow(2, 8)", 256),
        ("round(2.567, 2)", 2.57),
        ("log(1)", 0),
        ("2 + 2", 4),  # result normalised to int
        ("  ( 1 + 1 )  ", 2),
        ("1e3 + 1", 1001),
    ],
)
def test_evaluate_valid(expression: str, expected) -> None:
    result = evaluate(expression)
    if isinstance(expected, float):
        assert result == pytest.approx(expected)
    else:
        assert result == expected


@pytest.mark.parametrize(
    "expression",
    [
        "",
        "   ",
        "2 +",
        "* 5",
        "1 / 0",
        "1 // 0",
        "1 % 0",
        "2 ** 1000000",
        "__import__('os')",
        "os.system('ls')",
        "open('/etc/passwd')",
        "lambda x: x",
        "[1,2,3]",
        "{'a': 1}",
        "2 + True",
        "foo(2)",
        "2; 3",
        "import os",
        "sqrt()",
        "2 ** 3 ** 4 ** 5",
    ],
)
def test_evaluate_invalid(expression: str) -> None:
    with pytest.raises(CalculationError):
        evaluate(expression)


def test_unknown_function_rejected() -> None:
    with pytest.raises(CalculationError, match="not allowed"):
        evaluate("unknown_func(1)")


def test_division_by_zero_message() -> None:
    with pytest.raises(CalculationError, match="division by zero"):
        evaluate("1 / 0")


def test_result_integer_normalisation() -> None:
    assert evaluate("10 / 2") == 5
    assert isinstance(evaluate("10 / 2"), int)
    assert evaluate("10 / 4") == 2.5
    assert isinstance(evaluate("10 / 4"), float)
