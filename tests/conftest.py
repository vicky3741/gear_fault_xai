"""
Shared test setup: keep tests away from real data and real people.

- The prediction history goes to a temporary SQLite file, never data/history.db.
- Alerts are switched off and the real senders are replaced, so a test can never
  send a Telegram message or SMS (e.g. when run on the EC2 box where alerts are set up).
  Tests that check the alert logic still set their own fake channels with monkeypatch.
"""
import os, sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import config as C
from api import db, alerts


@pytest.fixture(scope="session", autouse=True)
def temporary_history_db(tmp_path_factory):
    path = str(tmp_path_factory.mktemp("history") / "history_test.db")
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(db, "DB_PATH", path)
        mp.setattr(C, "PROC_DIR", str(tmp_path_factory.mktemp("processed")))   # caches (e.g. class spectra)
        yield path


def _never_send(message):
    raise AssertionError("a test tried to send a real alert")


@pytest.fixture(autouse=True)
def no_real_alerts(monkeypatch):
    monkeypatch.setattr(C, "TELEGRAM_BOT_TOKEN", "")
    monkeypatch.setattr(C, "TELEGRAM_CHAT_ID", "")
    monkeypatch.setattr(C, "ALERT_PHONE", "")
    monkeypatch.setattr(alerts, "send_telegram", _never_send)
    monkeypatch.setattr(alerts, "send_sms", _never_send)
