from __future__ import annotations

from django.contrib.auth import get_user_model

from .models import Project, Team


User = get_user_model()


def get_user_teams(user):
    if user.is_superuser:
        return Team.objects.all()
    return user.teams.all()


def get_accessible_projects(user):
    if user.is_superuser:
        return Project.objects.all()
    return Project.objects.filter(team__members=user).distinct()


def user_can_access_project(user, project: Project | None) -> bool:
    if project is None:
        return False
    if user.is_superuser:
        return True
    if project.team_id is None:
        return False
    return project.team.members.filter(id=user.id).exists()


def ensure_user_workspace(user):
    if not user.is_authenticated:
        return

    teams = user.teams.order_by('id')
    if not teams.exists():
        base_name = f"{user.username} Team"
        team_name = base_name
        suffix = 2
        while Team.objects.filter(name=team_name).exists():
            team_name = f"{base_name} {suffix}"
            suffix += 1

        team = Team.objects.create(name=team_name)
        team.members.add(user)
        teams = user.teams.order_by('id')

    if not get_accessible_projects(user).exists():
        primary_team = teams.first()
        if primary_team is not None:
            Project.objects.create(
                team=primary_team,
                name="Default Project",
                description="Auto-created workspace for authenticated access.",
            )