from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Project, SimulationRun, Team, TeamInvite, TeamMembership
from .serializers import SimulationRunSerializer


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


class SimulationRunPhysicalValidationTests(TestCase):
    def setUp(self):
        self.team = Team.objects.create(name="Physics Validation Team")
        self.project = Project.objects.create(team=self.team, name="Physics Validation Project")

    def _payload(self):
        return {
            "project": self.project.id,
            "mass": 120.0,
            "payload_weight": 15.0,
            "center_of_gravity": [0.0, 0.0, 0.0],
            "velocity": 8.0,
            "angle_of_attack": 5.0,
            "water_density": 1025.0,
            "wave_height": 0.25,
            "submersion_depth": 0.75,
            "mesh_density": 1.0,
            "slice_axis": "y",
        }

    def test_accepts_physical_run_inputs(self):
        serializer = SimulationRunSerializer(data=self._payload())

        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_rejects_non_physical_run_inputs(self):
        invalid_cases = [
            ("velocity", -5.0, "Velocity must be positive."),
            ("angle_of_attack", 90.0, "Angle of attack must be between -90 and 90 degrees."),
            ("water_density", 0.0, "Water density must be between 0 and 2000 kg/m^3."),
            ("mass", 0.0, "Mass must be positive."),
            ("payload_weight", -1.0, "Payload weight cannot be negative."),
            ("wave_height", -0.1, "Wave height cannot be negative."),
            ("submersion_depth", -0.1, "Submersion depth cannot be negative."),
        ]

        for field_name, invalid_value, expected_message in invalid_cases:
            with self.subTest(field=field_name):
                payload = self._payload()
                payload[field_name] = invalid_value

                serializer = SimulationRunSerializer(data=payload)

                self.assertFalse(serializer.is_valid())
                self.assertIn(field_name, serializer.errors)
                self.assertEqual(serializer.errors[field_name][0], expected_message)


class SimulationRunDispatchFailureTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="dispatch-admin",
            email="dispatch-admin@example.com",
            password="ComplexPass123!",
        )
        self.team = Team.objects.create(name="Dispatch Failure Team")
        TeamMembership.objects.create(
            team=self.team,
            user=self.user,
            role=TeamMembership.RoleChoices.TEAM_ADMIN,
        )
        self.project = Project.objects.create(team=self.team, name="Dispatch Failure Project")

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _payload(self):
        return {
            "project": self.project.id,
            "mass": 120.0,
            "payload_weight": 15.0,
            "center_of_gravity": [0.0, 0.0, 0.0],
            "velocity": 8.0,
            "angle_of_attack": 5.0,
            "water_density": 1025.0,
            "wave_height": 0.25,
            "submersion_depth": 0.75,
            "mesh_density": 1.0,
            "slice_axis": "y",
        }

    def test_run_is_marked_failed_when_task_dispatch_fails(self):
        with patch("api.views.celery_app.send_task", side_effect=RuntimeError("broker unavailable")) as mocked_send_task:
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post("/api/runs/", self._payload(), format="json")

        self.assertEqual(response.status_code, 201)

        run = SimulationRun.objects.get(pk=response.json()["id"])

        mocked_send_task.assert_called_once_with("tasks.run_hydro_simulation", args=[run.id])
        self.assertEqual(run.status, SimulationRun.StatusChoices.FAILED)
        self.assertIn("Failed to enqueue simulation task", run.current_logs)
        self.assertIn("RuntimeError: broker unavailable", run.current_logs)