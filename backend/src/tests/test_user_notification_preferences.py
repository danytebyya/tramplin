from sqlalchemy import select

from src.enums import UserRole
from src.models import User, UserNotificationPreference
from src.tests.test_notifications import _register_and_login


def test_notification_preferences_returns_defaults(client, db_session):
    access_token = _register_and_login(
        client,
        db_session,
        email="notification-preferences-defaults@example.com",
        role="applicant",
    )

    response = client.get(
        "/api/v1/users/me/notification-preferences",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    assert response.json()["data"] == {
        "email_notifications": {
            "new_verification_requests": True,
            "content_complaints": False,
            "overdue_reviews": False,
            "company_profile_changes": False,
            "publication_changes": False,
            "daily_digest": False,
            "weekly_report": False,
        },
        "push_notifications": {
            "new_verification_requests": True,
            "content_complaints": False,
            "overdue_reviews": False,
            "company_profile_changes": False,
            "publication_changes": False,
            "daily_digest": False,
            "weekly_report": False,
        },
    }

    persisted_preferences = db_session.execute(select(UserNotificationPreference)).scalar_one()
    assert persisted_preferences.email_new_verification_requests is True
    assert persisted_preferences.push_new_verification_requests is True


def test_notification_preferences_can_be_updated(client, db_session):
    access_token = _register_and_login(
        client,
        db_session,
        email="notification-preferences-update@example.com",
        role="employer",
    )
    payload = {
        "email_notifications": {
            "new_verification_requests": False,
            "content_complaints": True,
            "overdue_reviews": True,
            "company_profile_changes": True,
            "publication_changes": False,
            "daily_digest": True,
            "weekly_report": False,
        },
        "push_notifications": {
            "new_verification_requests": False,
            "content_complaints": False,
            "overdue_reviews": True,
            "company_profile_changes": False,
            "publication_changes": True,
            "daily_digest": False,
            "weekly_report": True,
        },
    }

    response = client.put(
        "/api/v1/users/me/notification-preferences",
        json=payload,
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    assert response.json()["data"] == payload

    persisted_preferences = db_session.execute(select(UserNotificationPreference)).scalar_one()
    assert persisted_preferences.email_content_complaints is True
    assert persisted_preferences.email_daily_digest is True
    assert persisted_preferences.push_publication_changes is True
    assert persisted_preferences.push_weekly_report is True


def test_curator_notification_preferences_defaults_are_disabled(client, db_session):
    access_token = _register_and_login(
        client,
        db_session,
        email="notification-preferences-curator@example.com",
        role="applicant",
    )
    user = db_session.execute(
        select(User).where(User.email == "notification-preferences-curator@example.com")
    ).scalar_one()
    user.role = UserRole.CURATOR
    db_session.add(user)
    db_session.commit()

    response = client.get(
        "/api/v1/users/me/notification-preferences",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    assert response.json()["data"] == {
        "email_notifications": {
            "new_verification_requests": False,
            "content_complaints": False,
            "overdue_reviews": False,
            "company_profile_changes": False,
            "publication_changes": False,
            "daily_digest": False,
            "weekly_report": False,
        },
        "push_notifications": {
            "new_verification_requests": False,
            "content_complaints": False,
            "overdue_reviews": False,
            "company_profile_changes": False,
            "publication_changes": False,
            "daily_digest": False,
            "weekly_report": False,
        },
    }
