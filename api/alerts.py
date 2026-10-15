"""
Admin SMS alerts for the single monitored machine.

An SMS is sent when a new diagnosis moves the machine UP to 50%, 75% or 100% fault
compared with its previous diagnosis. Each level has its own message. A machine that
stays at the same level does not send another SMS.

Alerts stay OFF while ALERT_PHONE is empty (config.py). The text is guidance, not a rule.
"""
import config as C

LEVEL = {"Healthy": 0, "Severity-25": 1, "Severity-50": 2, "Severity-75": 3, "Severity-100": 4}
ALERT_CLASSES = ("Severity-50", "Severity-75", "Severity-100")
SHORT = {"Healthy": "Healthy", "Severity-25": "25%", "Severity-50": "50%",
         "Severity-75": "75%", "Severity-100": "100%"}

# Same meaning as the dashboard's guidance and reason texts (frontend/src/App.tsx).
MESSAGES = {
    "Severity-50": ("ALERT {machine}: fault severity now 50% (was {prev}). The defect has grown, "
                    "with stronger repeated impacts. Main frequency: {band}. "
                    "Action: schedule maintenance at the next opportunity. Confidence {conf}%."),
    "Severity-75": ("URGENT {machine}: fault severity now 75% (was {prev}). Large impacts on almost "
                    "every rotation, risk of further damage. Main frequency: {band}. "
                    "Action: plan corrective maintenance soon. Confidence {conf}%."),
    "Severity-100": ("CRITICAL {machine}: fault severity now 100% (was {prev}). Very strong impacts "
                     "each turn, failure can happen soon. Main frequency: {band}. "
                     "Action: stop the machine and repair now. Confidence {conf}%."),
}


def level(cls):
    return LEVEL.get(cls, -1)


def should_alert(prev_cls, new_cls):
    """True when the machine moves up into 50%, 75% or 100%. No previous diagnosis counts as Healthy."""
    return new_cls in ALERT_CLASSES and level(new_cls) > level(prev_cls or "Healthy")


def build_message(new_cls, prev_cls, band, conf):
    return MESSAGES[new_cls].format(machine=C.MACHINE_NAME, prev=SHORT.get(prev_cls or "Healthy", "Healthy"),
                                    band=band or "not available", conf=round(conf * 100, 1))


def send_telegram(message):
    """Send the message to the admin's Telegram chat through the bot. Returns the Telegram message_id."""
    import json, urllib.request
    url = f"https://api.telegram.org/bot{C.TELEGRAM_BOT_TOKEN}/sendMessage"
    body = json.dumps({"chat_id": C.TELEGRAM_CHAT_ID, "text": message}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if not data.get("ok"):
        raise RuntimeError(data.get("description", "Telegram refused the message"))
    return str(data["result"]["message_id"])


def send_sms(message):
    """Send one transactional SMS with AWS SNS. Returns the SNS MessageId."""
    import boto3
    sns = boto3.client("sns", region_name=C.AWS_REGION)
    attrs = {"AWS.SNS.SMS.SMSType": {"DataType": "String", "StringValue": "Transactional"}}
    if C.ALERT_SENDER_ID:
        attrs["AWS.SNS.SMS.SenderID"] = {"DataType": "String", "StringValue": C.ALERT_SENDER_ID}
    resp = sns.publish(PhoneNumber=C.ALERT_PHONE, Message=message, MessageAttributes=attrs)
    return resp["MessageId"]


def channel():
    """Telegram is used when configured, otherwise SMS when a phone number is set, otherwise alerts are off."""
    if C.TELEGRAM_BOT_TOKEN and C.TELEGRAM_CHAT_ID:
        return "telegram"
    if C.ALERT_PHONE:
        return "sms"
    return None


def send_alert(message):
    """Send through the configured channel. Returns (channel, message_id)."""
    ch = channel()
    if ch == "telegram":
        return ch, send_telegram(message)
    return ch, send_sms(message)


def check_and_alert(dataset, prev_cls, result, top_band):
    """
    Decide and send the alert for one new diagnosis. Never raises: a failed send must not
    break the diagnosis. Returns a small status dict stored in the API response.
    """
    if dataset != "time_domain":
        return None
    new_cls = result["predicted_class"]
    if not should_alert(prev_cls, new_cls):
        return {"sent": False, "reason": "no severity increase to 50%, 75% or 100%"}
    message = build_message(new_cls, prev_cls, top_band, result["confidence"])
    if channel() is None:
        return {"sent": False, "reason": "alerts off (no Telegram bot or phone number set)", "message": message}
    try:
        ch, msg_id = send_alert(message)
        return {"sent": True, "channel": ch, "message_id": msg_id, "message": message}
    except Exception as e:  # keep diagnosis working even if the alert fails
        return {"sent": False, "reason": f"alert failed: {e}", "message": message}
