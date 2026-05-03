from __future__ import annotations

from django.contrib.auth import get_user_model
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import Project, Team, TeamInvite, TeamMembership


User = get_user_model()


EDIT_ROLES = {
    TeamMembership.RoleChoices.ENGINEER,
    TeamMembership.RoleChoices.TEAM_ADMIN,
}
ADMIN_ROLES = {TeamMembership.RoleChoices.TEAM_ADMIN}


def get_user_team_memberships(user):
    if user.is_superuser:
        return TeamMembership.objects.select_related('team', 'user').all()
    return TeamMembership.objects.filter(user=user).select_related('team', 'user')


def get_user_teams(user):
    if user.is_superuser:
        return Team.objects.all()
    return Team.objects.filter(memberships__user=user).distinct()


def get_team_membership(user, team: Team | None):
    if team is None or not user.is_authenticated or user.is_superuser:
        return None
    return TeamMembership.objects.filter(team=team, user=user).select_related('team', 'user').first()


def user_has_team_role(user, team: Team | None, roles: set[str]) -> bool:
    if user.is_superuser:
        return True

    membership = get_team_membership(user, team)
    return membership is not None and membership.role in roles


def user_can_edit_team_resources(user, team: Team | None) -> bool:
    return user_has_team_role(user, team, EDIT_ROLES)


def user_can_manage_team(user, team: Team | None) -> bool:
    return user_has_team_role(user, team, ADMIN_ROLES)


def get_accessible_projects(user):
    if user.is_superuser:
        return Project.objects.all()
    return Project.objects.filter(team__memberships__user=user).distinct()


def user_can_access_project(user, project: Project | None) -> bool:
    if project is None:
        return False
    if user.is_superuser:
        return True
    if project.team_id is None:
        return False
    return TeamMembership.objects.filter(team=project.team, user=user).exists()


def ensure_user_workspace(user):
    if not user.is_authenticated:
        return

    teams = get_user_teams(user).order_by('id')
    if not teams.exists():
        base_name = f"{user.username} Team"
        team_name = base_name
        suffix = 2
        while Team.objects.filter(name=team_name).exists():
            team_name = f"{base_name} {suffix}"
            suffix += 1

        team = Team.objects.create(name=team_name)
        TeamMembership.objects.create(
            team=team,
            user=user,
            role=TeamMembership.RoleChoices.TEAM_ADMIN,
        )
        teams = get_user_teams(user).order_by('id')

    if not get_accessible_projects(user).exists():
        primary_team = teams.first()
        if primary_team is not None:
            Project.objects.create(
                team=primary_team,
                name="Default Project",
                description="Auto-created workspace for authenticated access.",
            )


def get_user_by_email(email: str | None):
    normalized = (email or '').strip().lower()
    if not normalized:
        return None
    return User.objects.filter(email__iexact=normalized).first()


def build_username_from_email(email: str) -> str:
    normalized = email.strip().lower()
    base = normalized[:150]
    if base and not User.objects.filter(username__iexact=base).exists():
        return base

    local_part = normalized.split('@', 1)[0] or 'user'
    local_part = ''.join(char if char.isalnum() else '_' for char in local_part).strip('_') or 'user'
    suffix = 2
    while True:
        candidate = f"{local_part[:140]}_{suffix}"
        if not User.objects.filter(username__iexact=candidate).exists():
            return candidate
        suffix += 1


def send_team_invite_email(invite: TeamInvite) -> bool:
    invite_url = f"{settings.FRONTEND_APP_URL.rstrip('/')}/join/{invite.token}"
    team_name = invite.team.name
    inviter_name = None
    if invite.invited_by is not None:
        inviter_name = f"{invite.invited_by.first_name} {invite.invited_by.last_name}".strip() or invite.invited_by.username

    intro = f"{inviter_name} invited you" if inviter_name else "You were invited"
    subject = f"Join {team_name} on Nereus"
    message = (
        f"{intro} to the {team_name} workspace in Nereus as a {invite.role.replace('_', ' ')}.\n\n"
        f"Open your invite link to join:\n{invite_url}\n\n"
        f"This link expires on {invite.expires_at.strftime('%Y-%m-%d %H:%M UTC')}."
    )

    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[invite.email],
            fail_silently=False,
        )
    except Exception as exc:
        invite.delivery_error = str(exc)[:500]
        invite.save(update_fields=['delivery_error', 'updated_at'])
        return False

    invite.last_sent_at = timezone.now()
    invite.send_count += 1
    invite.delivery_error = ''
    invite.save(update_fields=['last_sent_at', 'send_count', 'delivery_error', 'updated_at'])
    return True