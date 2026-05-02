from rest_framework.permissions import BasePermission

from .models import Folder, HydrofoilAsset, Project, SimulationRun


class IsOwnerOrTeamMember(BasePermission):
    message = 'You do not have access to this resource.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser:
            return True

        project = self._resolve_project(obj)
        if project is None or project.team_id is None:
            return False

        return project.team.members.filter(id=request.user.id).exists()

    def _resolve_project(self, obj):
        if isinstance(obj, Project):
            return obj
        if isinstance(obj, (Folder, HydrofoilAsset, SimulationRun)):
            return obj.project
        return None