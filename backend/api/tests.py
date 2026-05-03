from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Team, TeamInvite, TeamMembership


User = get_user_model()


@override_settings(
    ALLOWED_HOSTS=["localhost", "127.0.0.1", "testserver"],
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_APP_URL="http://localhost:5173",
    DEFAULT_FROM_EMAIL="noreply@example.com",
)
class TeamInviteSignupFlowTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="invite-admin",
            email="invite-admin@example.com",
            password="ComplexPass123!",
            first_name="Invite",
            last_name="Admin",
        )
        self.team = Team.objects.create(name="Invite Smoke Team")
        TeamMembership.objects.create(
            team=self.team,
            user=self.admin,
            role=TeamMembership.RoleChoices.TEAM_ADMIN,
        )

        self.admin_client = APIClient()
        self.admin_client.force_authenticate(user=self.admin)
        self.guest_client = APIClient()

    def test_team_admin_can_resend_and_invited_user_can_sign_up(self):
        invited_email = "new.engineer@example.com"

        create_response = self.admin_client.post(
            f"/api/teams/{self.team.id}/invites/",
            {"email": invited_email, "role": TeamMembership.RoleChoices.ENGINEER},
            format="json",
        )

        self.assertEqual(create_response.status_code, 201)
        create_data = create_response.json()
        invite = TeamInvite.objects.get(pk=create_data["id"])
        first_token = invite.token

        self.assertEqual(invite.send_count, 1)
        self.assertEqual(invite.delivery_error, "")
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.team.name, mail.outbox[0].subject)
        self.assertIn(f"/join/{first_token}", mail.outbox[0].body)

        resend_response = self.admin_client.post(
            f"/api/teams/{self.team.id}/invites/{invite.id}/resend/",
            {},
            format="json",
        )

        self.assertEqual(resend_response.status_code, 200)

        invite.refresh_from_db()
        second_token = invite.token
        self.assertNotEqual(first_token, second_token)
        self.assertEqual(invite.send_count, 2)
        self.assertEqual(invite.status, TeamInvite.StatusChoices.PENDING)
        self.assertEqual(invite.delivery_error, "")
        self.assertEqual(len(mail.outbox), 2)
        self.assertIn(f"/join/{second_token}", mail.outbox[1].body)

        preview_response = self.guest_client.get(f"/api/team-invites/{second_token}/")

        self.assertEqual(preview_response.status_code, 200)
        preview_data = preview_response.json()
        self.assertEqual(preview_data["team"]["id"], self.team.id)
        self.assertFalse(preview_data["existing_account"])
        self.assertEqual(preview_data["role"], TeamMembership.RoleChoices.ENGINEER)

        signup_response = self.guest_client.post(
            f"/api/team-invites/{second_token}/signup/",
            {
                "first_name": "New",
                "last_name": "Engineer",
                "password": "ComplexPass123!",
                "password_confirm": "ComplexPass123!",
            },
            format="json",
        )

        self.assertEqual(signup_response.status_code, 201)
        signup_data = signup_response.json()
        self.assertEqual(signup_data["user"]["email"], invited_email)
        self.assertEqual(signup_data["team"]["id"], self.team.id)

        me_response = self.guest_client.get("/api/auth/me/")

        self.assertEqual(me_response.status_code, 200)
        me_data = me_response.json()
        self.assertEqual(me_data["email"], invited_email)
        self.assertIn(self.team.id, [team["id"] for team in me_data["teams"]])

        invite.refresh_from_db()
        membership = TeamMembership.objects.select_related("user").get(
            team=self.team,
            user__email=invited_email,
        )

        self.assertEqual(invite.status, TeamInvite.StatusChoices.ACCEPTED)
        self.assertEqual(invite.accepted_by_id, membership.user_id)
        self.assertEqual(membership.role, TeamMembership.RoleChoices.ENGINEER)