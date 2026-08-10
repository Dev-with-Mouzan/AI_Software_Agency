"""Safe math expression evaluator.

Evaluates arithmetic expressions without ever using ``eval``/``exec``.
The expression is parsed into an AST and only a whitelist of nodes is
allowed (numbers, binary arithmetic ops, parentheses, and a small set
of math functions), so arbitrary code cannot be executed.
"""

from __future__ import annotations

import ast
import math
import operator
from typing import Union

# Node types -> actual Python operators
_BINARY_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}

_UNARY_OPS = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}

# Whitelisted math functions callable from an expression.
ALLOWED_FUNCTIONS = {
    "abs": abs,
    "ceil": math.ceil,
    "cos": math.cos,
    "exp": math.exp,
    "floor": math.floor,
    "log": math.log,
    "log10": math.log10,
    "pow": pow,
    "round": round,
    "sin": math.sin,
    "sqrt": math.sqrt,
    "tan": math.tan,
}

# Numeric literal max length guard (prevents absurdly long literals).
_MAX_LITERAL_CHARS = 40


class CalculationError(ValueError):
    """Raised when an expression is invalid or cannot be computed."""


def _is_number(node: ast.AST) -> bool:
    return isinstance(node, ast.Constant) and isinstance(node.value, (int, float))


def _check_literal(node: ast.Constant) -> None:
    if len(str(node.value)) > _MAX_LITERAL_CHARS:
        raise CalculationError("numeric literal too long")
    if isinstance(node.value, bool):
        raise CalculationError("boolean literals are not supported")


def _eval(node: ast.AST) -> Union[int, float]:
    """Recursively evaluate a whitelisted AST node."""
    if isinstance(node, ast.Expression):
        return _eval(node.body)

    if isinstance(node, ast.Constant) and _is_number(node):
        _check_literal(node)
        return node.value  # type: ignore[return-value]

    if isinstance(node, ast.BinOp) and type(node.op) in _BINARY_OPS:
        left = _eval(node.left)
        right = _eval(node.right)
        try:
            return _BINARY_OPS[type(node.op)](left, right)
        except ZeroDivisionError:
            raise CalculationError("division by zero") from None
        except OverflowError:
            raise CalculationError("result too large") from None

    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY_OPS:
        return _UNARY_OPS[type(node.op)](_eval(node.operand))

    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        func_name = node.func.id
        if func_name not in ALLOWED_FUNCTIONS:
            raise CalculationError(f"function '{func_name}' is not allowed")
        if node.keywords:
            raise CalculationError("keyword arguments are not allowed")
        args = [_eval(arg) for arg in node.args]
        try:
            return ALLOWED_FUNCTIONS[func_name](*args)
        except (ValueError, OverflowError, ZeroDivisionError) as exc:
            raise CalculationError(str(exc)) from None

    raise CalculationError("unsupported syntax in expression")


def evaluate(expression: str) -> Union[int, float]:
    """Evaluate an arithmetic expression and return the numeric result.

    Raises:
        CalculationError: if the expression is invalid or cannot be computed.
    """
    if not isinstance(expression, str) or not expression.strip():
        raise CalculationError("expression must be a non-empty string")

    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError:
        raise CalculationError("invalid expression syntax") from None

    try:
        result = _eval(tree)
    except RecursionError:
        raise CalculationError("expression too deeply nested") from None

    # Normalise float results: drop trailing ".0" where exact.
    if isinstance(result, float) and result.is_integer() and abs(result) < 1e15:
        return int(result)
    return result
