# -*- coding: utf-8 -*-
"""Unit tests for counter arbitrary-amount parsing and execution."""

import pytest

from services.ai.pipeline.rules.shared.num_parser import parse_amount


class TestParseAmount:
    def test_none_defaults_to_one(self):
        assert parse_amount(None) == 1

    def test_empty_string_defaults_to_one(self):
        assert parse_amount("") == 1
        assert parse_amount("   ") == 1

    def test_arabic_digits(self):
        assert parse_amount("3") == 3
        assert parse_amount("10") == 10
        assert parse_amount("25") == 25

    def test_chinese_units(self):
        assert parse_amount("一") == 1
        assert parse_amount("三") == 3
        assert parse_amount("九") == 9
        assert parse_amount("两") == 2

    def test_chinese_ten(self):
        assert parse_amount("十") == 10
        assert parse_amount("十一") == 11
        assert parse_amount("十九") == 19

    def test_chinese_tens(self):
        assert parse_amount("二十") == 20
        assert parse_amount("二十三") == 23
        assert parse_amount("九十九") == 99

    def test_invalid_falls_back_to_one(self):
        assert parse_amount("abc") == 1
        assert parse_amount("百") == 1

    def test_exotic_unicode_digit_does_not_crash(self):
        # str.isdigit() is True for these but int() would raise ValueError
        assert parse_amount("²") == 1
        assert parse_amount("⑤") == 1

    def test_fullwidth_digits(self):
        assert parse_amount("３") == 3

    def test_large_arabic_passes_through(self):
        assert parse_amount("100") == 100
