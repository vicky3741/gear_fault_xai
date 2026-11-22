"""Rules for the admin alerts (api/alerts.py). No real message is sent by these tests."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config as C
from api import alerts


def _no_channel(monkeypatch):
    monkeypatch.setattr(C, "TELEGRAM_BOT_TOKEN", "")
    monkeypatch.setattr(C, "TELEGRAM_CHAT_ID", "")
    monkeypatch.setattr(C, "ALERT_PHONE", "")


def test_alert_only_when_moving_up_to_50_75_100():
    assert alerts.should_alert("Healthy", "Severity-50")
    assert alerts.should_alert("Severity-50", "Severity-75")
    assert alerts.should_alert("Severity-75", "Severity-100")
    assert alerts.should_alert("Severity-25", "Severity-100")      # jump up still alerts
    assert alerts.should_alert(None, "Severity-75")                # first diagnosis counts as from Healthy


def test_no_alert_for_low_levels_or_same_level_or_decrease():
    assert not alerts.should_alert("Healthy", "Healthy")
    assert not alerts.should_alert("Healthy", "Severity-25")       # 25% never alerts
    assert not alerts.should_alert("Severity-50", "Severity-50")   # staying at 50% sends nothing new
    assert not alerts.should_alert("Severity-100", "Severity-75")  # going down sends nothing
    assert not alerts.should_alert("Severity-25", "Healthy")


def test_each_level_has_its_own_message():
    m50 = alerts.build_message("Severity-50", "Healthy", 0.8123)
    m75 = alerts.build_message("Severity-75", "Severity-50", 0.8123)
    m100 = alerts.build_message("Severity-100", "Severity-75", 0.8123)
    assert m50.startswith("ALERT") and "50%" in m50
    assert m75.startswith("URGENT") and "75%" in m75
    assert m100.startswith("CRITICAL") and "100%" in m100
    assert len({m50, m75, m100}) == 3
    for m in (m50, m75, m100):
        assert C.MACHINE_NAME in m and "81.2%" in m
        assert "was" in m and "Action:" in m
        assert "Main frequency" not in m          # no SHAP step on the alert path


def test_alerts_are_off_without_any_channel(monkeypatch):
    _no_channel(monkeypatch)
    res = {"predicted_class": "Severity-75", "confidence": 0.9}
    out = alerts.check_and_alert("time_domain", "Severity-50", res)
    assert out["sent"] is False and "alerts off" in out["reason"]
    assert "URGENT" in out["message"]


def test_no_increase_means_no_send(monkeypatch):
    monkeypatch.setattr(C, "TELEGRAM_BOT_TOKEN", "t")
    monkeypatch.setattr(C, "TELEGRAM_CHAT_ID", "1")
    monkeypatch.setattr(alerts, "send_telegram", lambda msg: 1 / 0)   # must never be called
    res = {"predicted_class": "Severity-25", "confidence": 0.7}
    out = alerts.check_and_alert("time_domain", "Healthy", res)
    assert out["sent"] is False and "no severity increase" in out["reason"]


def test_telegram_is_used_when_configured(monkeypatch):
    _no_channel(monkeypatch)
    monkeypatch.setattr(C, "TELEGRAM_BOT_TOKEN", "t")
    monkeypatch.setattr(C, "TELEGRAM_CHAT_ID", "1")
    sent = []
    monkeypatch.setattr(alerts, "send_telegram", lambda msg: sent.append(msg) or "77")
    res = {"predicted_class": "Severity-100", "confidence": 0.95}
    out = alerts.check_and_alert("time_domain", "Severity-75", res)
    assert out["sent"] is True and out["channel"] == "telegram" and out["message_id"] == "77"
    assert len(sent) == 1 and sent[0].startswith("CRITICAL")


def test_sms_is_the_fallback(monkeypatch):
    _no_channel(monkeypatch)
    monkeypatch.setattr(C, "ALERT_PHONE", "+910000000000")
    monkeypatch.setattr(alerts, "send_sms", lambda msg: "sns-1")
    res = {"predicted_class": "Severity-50", "confidence": 0.6}
    out = alerts.check_and_alert("time_domain", "Healthy", res)
    assert out["sent"] is True and out["channel"] == "sms" and out["message_id"] == "sns-1"


def test_failure_is_reported_not_raised(monkeypatch):
    _no_channel(monkeypatch)
    monkeypatch.setattr(C, "TELEGRAM_BOT_TOKEN", "t")
    monkeypatch.setattr(C, "TELEGRAM_CHAT_ID", "1")
    def boom(msg):
        raise RuntimeError("bot was blocked by the user")
    monkeypatch.setattr(alerts, "send_telegram", boom)
    res = {"predicted_class": "Severity-50", "confidence": 0.6}
    out = alerts.check_and_alert("time_domain", "Healthy", res)
    assert out["sent"] is False and "bot was blocked" in out["reason"]


def test_other_datasets_never_alert():
    assert alerts.check_and_alert("other", "Healthy", {"predicted_class": "Severity-100", "confidence": 1}) is None
