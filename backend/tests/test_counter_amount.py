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


from unittest.mock import patch

from services.ai.tools_executor import _execute_tool


class TestUpdateCounterAmount:
    @patch("services.ai.tools_executor.counter_dao")
    def test_increment_with_explicit_amount(self, mock_dao):
        mock_dao.get_counter_by_id.return_value = {"id": "c1", "step": 5}
        mock_dao.increment_counter.return_value = {"id": "c1", "current_value": 3}
        _execute_tool(
            "u1", "update_counter",
            {"counter_id": "c1", "action": "increment", "amount": 3},
        )
        mock_dao.increment_counter.assert_called_once_with("u1", "c1", 3)

    @patch("services.ai.tools_executor.counter_dao")
    def test_increment_without_amount_falls_back_to_step(self, mock_dao):
        mock_dao.get_counter_by_id.return_value = {"id": "c1", "step": 5}
        mock_dao.increment_counter.return_value = {"id": "c1", "current_value": 5}
        _execute_tool(
            "u1", "update_counter",
            {"counter_id": "c1", "action": "increment"},
        )
        mock_dao.increment_counter.assert_called_once_with("u1", "c1", 5)

    @patch("services.ai.tools_executor.counter_dao")
    def test_decrement_with_explicit_amount(self, mock_dao):
        mock_dao.get_counter_by_id.return_value = {"id": "c1", "step": 5}
        mock_dao.decrement_counter.return_value = {"id": "c1", "current_value": 0}
        _execute_tool(
            "u1", "update_counter",
            {"counter_id": "c1", "action": "decrement", "amount": 2},
        )
        mock_dao.decrement_counter.assert_called_once_with("u1", "c1", 2)

    @patch("services.ai.tools_executor.counter_dao")
    def test_increment_negative_amount_falls_back_to_step(self, mock_dao):
        mock_dao.get_counter_by_id.return_value = {"id": "c1", "step": 5}
        mock_dao.increment_counter.return_value = {"id": "c1", "current_value": 5}
        _execute_tool(
            "u1", "update_counter",
            {"counter_id": "c1", "action": "increment", "amount": -3},
        )
        mock_dao.increment_counter.assert_called_once_with("u1", "c1", 5)

    @patch("services.ai.tools_executor.counter_dao")
    def test_increment_zero_amount_falls_back_to_step(self, mock_dao):
        mock_dao.get_counter_by_id.return_value = {"id": "c1", "step": 5}
        mock_dao.increment_counter.return_value = {"id": "c1", "current_value": 5}
        _execute_tool(
            "u1", "update_counter",
            {"counter_id": "c1", "action": "increment", "amount": 0},
        )
        mock_dao.increment_counter.assert_called_once_with("u1", "c1", 5)

    @patch("services.ai.tools_executor.counter_dao")
    def test_increment_amount_not_refetched_when_valid(self, mock_dao):
        # When a valid amount is given, we should NOT waste a get_counter_by_id call
        mock_dao.increment_counter.return_value = {"id": "c1", "current_value": 3}
        _execute_tool(
            "u1", "update_counter",
            {"counter_id": "c1", "action": "increment", "amount": 3},
        )
        mock_dao.increment_counter.assert_called_once_with("u1", "c1", 3)
        mock_dao.get_counter_by_id.assert_not_called()


class TestUpdateCounterSchema:
    def test_update_counter_has_amount_property(self):
        from services.ai.tools_schema import TOOLS
        tool = next(t for t in TOOLS if t["name"] == "update_counter")
        props = tool["input_schema"]["properties"]
        assert "amount" in props
        assert props["amount"]["type"] == "integer"
