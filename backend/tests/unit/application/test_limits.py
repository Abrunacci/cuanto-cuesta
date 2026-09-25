from decimal import Decimal

import pytest

from cuanto_cuesta.application.limits import value_problem


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("NaN", "must be a finite number, got NaN"),
        ("Infinity", "must be a finite number, got Infinity"),
        ("-0.01", "must not be negative, got -0.01"),
        ("20.01", "must be at most 20, got 20.01"),
    ],
)
def test_explains_why_a_bare_value_is_not_acceptable(value: str, expected: str) -> None:
    assert value_problem(Decimal(value), Decimal(20)) == expected


@pytest.mark.parametrize("value", ["0", "20"])
def test_accepts_a_value_from_zero_to_the_cap(value: str) -> None:
    assert value_problem(Decimal(value), Decimal(20)) is None
