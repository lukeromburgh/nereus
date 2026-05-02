from __future__ import annotations

from django.contrib.auth import get_user_model

from .models import Project, Team, TeamMembership


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