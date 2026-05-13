import logging
import os
import shutil
from rest_framework import viewsets, parsers, status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from .access import (
    build_username_from_email,
    ensure_user_workspace,
    get_accessible_projects,
    get_user_by_email,
    get_user_teams,
    send_team_invite_email,
    user_can_manage_team,
)
from .models import Folder, HydrofoilAsset, Project, SimulationRun, Team, TeamInvite, TeamMembership
from .permissions import IsOwnerOrTeamMember
from .serializers import (
    CurrentUserSerializer,
    FolderSerializer,
    HydrofoilAssetSerializer,
    LoginSerializer,
    ProjectSerializer,
    SimulationRunSerializer,
    TeamDetailSerializer,
    TeamInviteCreateSerializer,
    TeamInvitePreviewSerializer,
    TeamInviteSignupSerializer,
    TeamInviteSerializer,
    TeamMembershipUpdateSerializer,
    TeamSerializer,
    TeamUpdateSerializer,
)
from django.db import transaction

# Import the Celery app to dispatch tasks by name.
# Do NOT import task stubs — @shared_task stubs overwrite the real
# worker implementation when django.setup() runs inside the worker.
from nereus_core.celery import app as celery_app


logger = logging.getLogger(__name__)

ACTIVE_RUN_STATUSES = {
    SimulationRun.StatusChoices.PENDING,
    SimulationRun.StatusChoices.MESHING,
    SimulationRun.StatusChoices.RUNNING,
}
RESTARTABLE_RUN_STATUSES = {
    SimulationRun.StatusChoices.FAILED,
    SimulationRun.StatusChoices.COMPLETED,
    SimulationRun.StatusChoices.CANCELLED,
}


def _copy_run_asset_to_case(instance):
    if instance.asset and instance.asset.file:
        sim_dir = os.path.join(
            settings.BASE_DIR.parent,
            'data',
            'simulations',
            str(instance.id),
            'constant',
            'triSurface',
        )
        os.makedirs(sim_dir, exist_ok=True)

        source_path = instance.asset.file.path
        _, ext = os.path.splitext(source_path)
        ext = (ext or '').lower()

        dest_input_path = os.path.join(sim_dir, f"foil_input{ext}")
        shutil.copy2(source_path, dest_input_path)

        if ext == '.stl':
            shutil.copy2(source_path, os.path.join(sim_dir, 'foil.stl'))


def _build_clone_payload(run):
    return {
        'project': run.project_id,
        'asset': run.asset_id,
        'mass': run.mass,
        'payload_weight': run.payload_weight,
        'center_of_gravity': run.center_of_gravity,
        'velocity': run.velocity,
        'angle_of_attack': run.angle_of_attack,
        'water_density': run.water_density,
        'wave_height': run.wave_height,
        'submersion_depth': run.submersion_depth,
        'enable_gravity': run.enable_gravity,
        'mesh_density': run.mesh_density,
        'enable_layers': run.enable_layers,
        'n_surface_layers': run.n_surface_layers,
        'layer_expansion': run.layer_expansion,
        'feature_level': run.feature_level,
        'pitch': run.pitch,
        'roll': run.roll,
        'yaw': run.yaw,
        'slice_axis': run.slice_axis,
    }


def _enqueue_simulation_run(run_id):
    try:
        async_result = celery_app.send_task('tasks.run_hydro_simulation', args=[run_id])
        SimulationRun.objects.filter(pk=run_id).update(
            celery_task_id=getattr(async_result, 'id', '') or '',
            updated_at=timezone.now(),
        )
    except Exception as exc:
        logger.exception('Failed to enqueue simulation task for run %s', run_id)
        SimulationRun.objects.filter(pk=run_id).update(
            status=SimulationRun.StatusChoices.FAILED,
            celery_task_id='',
            current_logs=f'Failed to enqueue simulation task: {type(exc).__name__}: {exc}',
            updated_at=timezone.now(),
        )


@method_decorator(ensure_csrf_cookie, name='dispatch')
class CsrfCookieView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'csrfToken': get_token(request)})


class SessionLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = authenticate(
            request,
            username=serializer.validated_data['username'],
            password=serializer.validated_data['password'],
        )
        if user is None:
            return Response(
                {'detail': 'Invalid username or password.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        login(request, user)
        ensure_user_workspace(user)
        return Response(CurrentUserSerializer(user, context={'request': request}).data)


class SessionLogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response({'detail': 'Logged out.'}, status=status.HTTP_200_OK)


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_user_workspace(request.user)
        return Response(CurrentUserSerializer(request.user, context={'request': request}).data)


class TeamViewSet(viewsets.ModelViewSet):
    queryset = Team.objects.all()
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_queryset(self):
        return get_user_teams(self.request.user).prefetch_related('memberships__user', 'projects', 'invites__invited_by')

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return TeamDetailSerializer
        if self.action == 'partial_update':
            return TeamUpdateSerializer
        return TeamSerializer

    def partial_update(self, request, *args, **kwargs):
        team = self.get_object()
        if not user_can_manage_team(request.user, team):
            return Response({'detail': 'You do not have permission to manage this team.'}, status=status.HTTP_403_FORBIDDEN)
        serializer = self.get_serializer(team, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(TeamDetailSerializer(team, context={'request': request}).data)


class TeamInviteCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, team_pk):
        team = get_object_or_404(get_user_teams(request.user), pk=team_pk)
        if not user_can_manage_team(request.user, team):
            return Response({'detail': 'You do not have permission to invite members to this team.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = TeamInviteCreateSerializer(data=request.data, context={'request': request, 'team': team})
        serializer.is_valid(raise_exception=True)
        invite = serializer.save()
        send_team_invite_email(invite)
        return Response(TeamInviteSerializer(invite, context={'request': request}).data, status=status.HTTP_201_CREATED)


class TeamInviteResendView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, team_pk, invite_pk):
        team = get_object_or_404(get_user_teams(request.user), pk=team_pk)
        if not user_can_manage_team(request.user, team):
            return Response({'detail': 'You do not have permission to resend invites for this team.'}, status=status.HTTP_403_FORBIDDEN)

        invite = get_object_or_404(TeamInvite.objects.filter(team=team).select_related('team', 'invited_by'), pk=invite_pk)
        invite.refresh_status(save=True)

        if invite.status in {TeamInvite.StatusChoices.ACCEPTED, TeamInvite.StatusChoices.REVOKED}:
            return Response({'detail': 'Only pending or expired invites can be resent.'}, status=status.HTTP_400_BAD_REQUEST)

        invite.reactivate()
        send_team_invite_email(invite)
        return Response(TeamInviteSerializer(invite, context={'request': request}).data, status=status.HTTP_200_OK)


class TeamInviteRevokeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, team_pk, invite_pk):
        team = get_object_or_404(get_user_teams(request.user), pk=team_pk)
        if not user_can_manage_team(request.user, team):
            return Response({'detail': 'You do not have permission to revoke invites for this team.'}, status=status.HTTP_403_FORBIDDEN)

        invite = get_object_or_404(TeamInvite.objects.filter(team=team).select_related('team', 'invited_by'), pk=invite_pk)
        invite.refresh_status(save=True)

        if invite.status != TeamInvite.StatusChoices.PENDING:
            return Response({'detail': 'Only active invites can be revoked.'}, status=status.HTTP_400_BAD_REQUEST)

        invite.revoke()
        return Response(TeamInviteSerializer(invite, context={'request': request}).data)


class TeamInvitePreviewView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        invite = get_object_or_404(TeamInvite.objects.select_related('team'), token=token)
        invite.refresh_status(save=True)
        return Response(TeamInvitePreviewSerializer(invite, context={'request': request}).data)


class TeamInviteAcceptView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, token):
        invite = get_object_or_404(TeamInvite.objects.select_related('team'), token=token)
        invite.refresh_status(save=True)

        if invite.status != TeamInvite.StatusChoices.PENDING:
            return Response(
                {
                    'detail': 'This invite is no longer active.',
                    'status': invite.status,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not request.user.is_superuser:
            invite_email = invite.email.strip().lower()
            user_email = (request.user.email or '').strip().lower()
            if not user_email:
                return Response(
                    {'detail': 'Your account needs an email address before accepting this invite.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if user_email != invite_email:
                return Response(
                    {'detail': 'This invite was issued for a different email address.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        TeamMembership.objects.get_or_create(
            team=invite.team,
            user=request.user,
            defaults={'role': invite.role},
        )
        invite.accept(request.user)
        ensure_user_workspace(request.user)

        return Response(
            {
                'detail': 'Invite accepted.',
                'team': TeamSerializer(invite.team, context={'request': request}).data,
            },
            status=status.HTTP_200_OK,
        )


class TeamInviteSignupView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, token):
        invite = get_object_or_404(TeamInvite.objects.select_related('team'), token=token)
        invite.refresh_status(save=True)

        if invite.status != TeamInvite.StatusChoices.PENDING:
            return Response(
                {
                    'detail': 'This invite is no longer active.',
                    'status': invite.status,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if get_user_by_email(invite.email) is not None:
            return Response(
                {'detail': 'An account already exists for this email. Sign in to accept the invite.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = TeamInviteSignupSerializer(data=request.data, context={'invite': invite})
        serializer.is_valid(raise_exception=True)

        user_model = get_user_model()
        user = user_model.objects.create_user(
            username=build_username_from_email(invite.email),
            email=invite.email,
            password=serializer.validated_data['password'],
            first_name=serializer.validated_data.get('first_name', '').strip(),
            last_name=serializer.validated_data.get('last_name', '').strip(),
        )

        TeamMembership.objects.get_or_create(
            team=invite.team,
            user=user,
            defaults={'role': invite.role},
        )
        invite.accept(user)
        login(request, user)
        ensure_user_workspace(user)

        return Response(
            {
                'detail': 'Account created and invite accepted.',
                'team': TeamSerializer(invite.team, context={'request': request}).data,
                'user': CurrentUserSerializer(user, context={'request': request}).data,
            },
            status=status.HTTP_201_CREATED,
        )


class TeamMemberUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, team_pk, user_pk):
        team = get_object_or_404(get_user_teams(request.user), pk=team_pk)
        if not user_can_manage_team(request.user, team):
            return Response({'detail': 'You do not have permission to manage members for this team.'}, status=status.HTTP_403_FORBIDDEN)

        membership = get_object_or_404(TeamMembership.objects.select_related('user', 'team'), team=team, user_id=user_pk)
        serializer = TeamMembershipUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        next_role = serializer.validated_data['role']

        if membership.role == TeamMembership.RoleChoices.TEAM_ADMIN and next_role != TeamMembership.RoleChoices.TEAM_ADMIN:
            admin_count = TeamMembership.objects.filter(team=team, role=TeamMembership.RoleChoices.TEAM_ADMIN).count()
            if admin_count <= 1:
                return Response({'detail': 'This team must keep at least one team admin.'}, status=status.HTTP_400_BAD_REQUEST)

        membership.role = next_role
        membership.save(update_fields=['role', 'updated_at'])
        return Response({'detail': 'Member role updated.', 'member': TeamMemberSerializer(membership).data}, status=status.HTTP_200_OK)


class TeamMemberRemoveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, team_pk, user_pk):
        team = get_object_or_404(get_user_teams(request.user), pk=team_pk)
        if not user_can_manage_team(request.user, team):
            return Response({'detail': 'You do not have permission to manage members for this team.'}, status=status.HTTP_403_FORBIDDEN)

        membership = get_object_or_404(TeamMembership.objects.select_related('user', 'team'), team=team, user_id=user_pk)
        if membership.role == TeamMembership.RoleChoices.TEAM_ADMIN:
            admin_count = TeamMembership.objects.filter(team=team, role=TeamMembership.RoleChoices.TEAM_ADMIN).count()
            if admin_count <= 1:
                return Response({'detail': 'This team must keep at least one team admin.'}, status=status.HTTP_400_BAD_REQUEST)

        membership.delete()
        return Response({'detail': 'Member removed.'}, status=status.HTTP_200_OK)

class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    permission_classes = [IsOwnerOrTeamMember]

    def get_queryset(self):
        qs = get_accessible_projects(self.request.user).order_by('name')
        team_id = self.request.query_params.get('team')
        if team_id:
            qs = qs.filter(team_id=team_id)
        return qs

class HydrofoilAssetViewSet(viewsets.ModelViewSet):
    queryset = HydrofoilAsset.objects.all()
    serializer_class = HydrofoilAssetSerializer
    permission_classes = [IsOwnerOrTeamMember]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]

    def get_queryset(self):
        qs = HydrofoilAsset.objects.filter(project__in=get_accessible_projects(self.request.user)).select_related('project', 'folder')
        project_id = self.request.query_params.get('project')
        if project_id:
            qs = qs.filter(project_id=project_id)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def destroy(self, request, *args, **kwargs):
        asset = self.get_object()
        run_count = asset.simulation_runs.count()
        if run_count > 0:
            force = request.query_params.get('force', 'false').lower() == 'true'
            if not force:
                return Response(
                    {
                        'warning': f'This asset has {run_count} simulation run(s). Deleting it will also delete those runs.',
                        'run_count': run_count,
                        'requires_force': True,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['patch'])
    def move(self, request, pk=None):
        """Move an asset to a different folder. Pass folder=null for project root."""
        asset = self.get_object()
        folder_id = request.data.get('folder')
        if folder_id is not None:
            try:
                folder = Folder.objects.get(id=folder_id, project=asset.project)
            except Folder.DoesNotExist:
                return Response({'error': 'Folder not found in this project'}, status=status.HTTP_404_NOT_FOUND)
            asset.folder = folder
        else:
            asset.folder = None
        asset.save()
        return Response(HydrofoilAssetSerializer(asset, context={'request': request}).data)

    @action(detail=True, methods=['patch'])
    def rename(self, request, pk=None):
        """Rename an asset."""
        asset = self.get_object()
        new_name = request.data.get('name')
        if not new_name or not new_name.strip():
            return Response({'error': 'Name is required'}, status=status.HTTP_400_BAD_REQUEST)
        asset.name = new_name.strip()
        asset.save()
        return Response(HydrofoilAssetSerializer(asset, context={'request': request}).data)


class FolderViewSet(viewsets.ModelViewSet):
    queryset = Folder.objects.all()
    serializer_class = FolderSerializer
    permission_classes = [IsOwnerOrTeamMember]

    def get_queryset(self):
        qs = Folder.objects.filter(project__in=get_accessible_projects(self.request.user)).select_related('project', 'parent')
        project_id = self.request.query_params.get('project')
        if project_id:
            qs = qs.filter(project_id=project_id)
        return qs

    def destroy(self, request, *args, **kwargs):
        folder = self.get_object()
        asset_count = folder.assets.count()
        child_count = folder.children.count()
        force = request.query_params.get('force', 'false').lower() == 'true'
        if (asset_count > 0 or child_count > 0) and not force:
            return Response(
                {
                    'warning': (
                        f'This folder contains {asset_count} asset(s) and {child_count} subfolder(s). '
                        'Assets will be moved to root. Subfolders will be deleted.'
                    ),
                    'asset_count': asset_count,
                    'child_count': child_count,
                    'requires_force': True,
                },
                status=status.HTTP_409_CONFLICT,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def tree(self, request):
        """Return the full folder tree for a project, including root-level assets."""
        project_id = request.query_params.get('project')
        if not project_id:
            return Response({'error': 'project query param required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            project = get_accessible_projects(request.user).get(id=project_id)
        except Project.DoesNotExist:
            return Response({'error': 'Project not found'}, status=status.HTTP_404_NOT_FOUND)

        root_folders = Folder.objects.filter(
            project=project, parent__isnull=True,
        ).prefetch_related('children', 'assets', 'children__children', 'children__assets').order_by('name')
        root_assets = HydrofoilAsset.objects.filter(
            project=project, folder__isnull=True,
        ).order_by('name')

        return Response({
            'folders': FolderSerializer(root_folders, many=True, context={'request': request}).data,
            'assets': HydrofoilAssetSerializer(root_assets, many=True, context={'request': request}).data,
        })

    @action(detail=True, methods=['patch'])
    def move(self, request, pk=None):
        """Move a folder to a different parent. Pass parent=null for project root."""
        folder = self.get_object()
        parent_id = request.data.get('parent')

        if parent_id is not None:
            if int(parent_id) == folder.id:
                return Response({'error': 'Cannot move folder into itself'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                parent = Folder.objects.get(id=parent_id, project=folder.project)
            except Folder.DoesNotExist:
                return Response({'error': 'Parent folder not found'}, status=status.HTTP_404_NOT_FOUND)
            # Check for circular reference
            ancestor = parent
            while ancestor is not None:
                if ancestor.id == folder.id:
                    return Response(
                        {'error': 'Cannot create circular folder structure'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                ancestor = ancestor.parent
            folder.parent = parent
        else:
            folder.parent = None
        folder.save()
        return Response(FolderSerializer(folder, context={'request': request}).data)

class SimulationRunViewSet(viewsets.ModelViewSet):
    queryset = SimulationRun.objects.all()
    serializer_class = SimulationRunSerializer
    permission_classes = [IsOwnerOrTeamMember]

    def get_queryset(self):
        qs = SimulationRun.objects.filter(project__in=get_accessible_projects(self.request.user)).select_related('project', 'asset')
        project_id = self.request.query_params.get('project')
        if project_id:
            qs = qs.filter(project_id=project_id)
        return qs

    @action(detail=True, methods=['get'])
    def analysis(self, request, pk=None):
        run = self.get_object()

        # Keep the payload explicit and stable for the frontend sync-loop.
        # Include direct VTP overlay helpers for pressure/vorticity/flow highlighting.
        # Only include optional overlay paths when the file actually exists.
        sim_dir = os.path.join(settings.BASE_DIR.parent, 'data', 'media', 'simulations', str(run.id))

        payload = {
            'id': run.id,
            'status': run.status,
            'result_sequence_path': run.result_sequence_path,
            'frame_mapping': run.frame_mapping or [],
            'metrics_series': run.metrics_series or [],
            'convergence_series': run.convergence_series or [],
            'mesh_diagnostics': run.mesh_diagnostics or {},
        }

        skin_friction_path = os.path.join(sim_dir, 'skin_friction_lines.vtp')
        if os.path.isfile(skin_friction_path):
            payload['skin_friction_lines_path'] = f"/media/simulations/{run.id}/skin_friction_lines.vtp"

        q_criterion_path = os.path.join(sim_dir, 'q_criterion_isosurface.vtp')
        if os.path.isfile(q_criterion_path):
            payload['q_criterion_isosurface_path'] = f"/media/simulations/{run.id}/q_criterion_isosurface.vtp"

        return Response(payload)

    def _create_simulation_run(self, serializer):
        with transaction.atomic():
            instance = serializer.save(
                status=SimulationRun.StatusChoices.PENDING,
                celery_task_id='',
            )
            _copy_run_asset_to_case(instance)
            transaction.on_commit(lambda run_id=instance.id: _enqueue_simulation_run(run_id))

        instance.refresh_from_db()
        serializer.instance = instance
        return instance

    def perform_create(self, serializer):
        self._create_simulation_run(serializer)

    @action(detail=True, methods=['post'])
    def rerun(self, request, pk=None):
        run = self.get_object()
        if run.status not in RESTARTABLE_RUN_STATUSES:
            return Response(
                {'error': 'Only completed, failed, or cancelled runs can be restarted.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data=_build_clone_payload(run))
        serializer.is_valid(raise_exception=True)
        instance = self._create_simulation_run(serializer)
        return Response(self.get_serializer(instance).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        run = self.get_object()
        if run.status not in ACTIVE_RUN_STATUSES:
            return Response(
                {'error': 'Only pending, meshing, or running runs can be cancelled.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        SimulationRun.objects.filter(pk=run.pk).update(
            status=SimulationRun.StatusChoices.CANCELLED,
            current_logs='Run cancelled by user.',
            updated_at=timezone.now(),
        )

        if run.celery_task_id:
            try:
                celery_app.control.revoke(run.celery_task_id, terminate=False)
            except Exception:
                logger.exception('Failed to revoke simulation task for run %s', run.pk)

        run.refresh_from_db()
        return Response(self.get_serializer(run).data)

    @action(detail=False, methods=['post'])
    def sweep(self, request):
        """Create a batch of simulation runs sweeping AoA over a range.

        Expects JSON body:
        {
            "aoa_start": -5,
            "aoa_end": 15,
            "aoa_step": 1,
            ... all other SimulationRun fields (velocity, asset, project, etc.)
        }

        Returns list of created run IDs.
        """
        data = request.data.copy()
        aoa_start = float(data.pop('aoa_start', 0))
        aoa_end = float(data.pop('aoa_end', 10))
        aoa_step = float(data.pop('aoa_step', 1))

        if aoa_step <= 0:
            return Response(
                {'error': 'aoa_step must be positive'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if aoa_start > aoa_end:
            return Response(
                {'error': 'aoa_start must be <= aoa_end'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Limit sweep size to prevent abuse
        num_steps = int((aoa_end - aoa_start) / aoa_step) + 1
        if num_steps > 50:
            return Response(
                {'error': f'Sweep would create {num_steps} runs (max 50)'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created_ids = []
        aoa = aoa_start
        while aoa <= aoa_end + 1e-9:
            run_data = data.copy()
            run_data['angle_of_attack'] = round(aoa, 4)
            serializer = self.get_serializer(data=run_data)
            serializer.is_valid(raise_exception=True)
            self.perform_create(serializer)
            created_ids.append(serializer.instance.id)
            aoa += aoa_step

        return Response(
            {'created_ids': created_ids, 'count': len(created_ids)},
            status=status.HTTP_201_CREATED,
        )
