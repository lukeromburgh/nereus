import os
import shutil
from rest_framework import viewsets, parsers, status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth import authenticate, login, logout
from django.conf import settings
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from .access import ensure_user_workspace, get_accessible_projects
from .models import Folder, HydrofoilAsset, Project, SimulationRun
from .permissions import IsOwnerOrTeamMember
from .serializers import (
    CurrentUserSerializer,
    FolderSerializer,
    HydrofoilAssetSerializer,
    LoginSerializer,
    ProjectSerializer,
    SimulationRunSerializer,
)
from django.db import transaction

# Import the Celery app to dispatch tasks by name.
# Do NOT import task stubs — @shared_task stubs overwrite the real
# worker implementation when django.setup() runs inside the worker.
from nereus_core.celery import app as celery_app


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
        return Response(CurrentUserSerializer(user).data)


class SessionLogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response({'detail': 'Logged out.'}, status=status.HTTP_200_OK)


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_user_workspace(request.user)
        return Response(CurrentUserSerializer(request.user).data)

class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    permission_classes = [IsOwnerOrTeamMember]

    def get_queryset(self):
        return get_accessible_projects(self.request.user).order_by('name')

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
        }

        skin_friction_path = os.path.join(sim_dir, 'skin_friction_lines.vtp')
        if os.path.isfile(skin_friction_path):
            payload['skin_friction_lines_path'] = f"/media/simulations/{run.id}/skin_friction_lines.vtp"

        q_criterion_path = os.path.join(sim_dir, 'q_criterion_isosurface.vtp')
        if os.path.isfile(q_criterion_path):
            payload['q_criterion_isosurface_path'] = f"/media/simulations/{run.id}/q_criterion_isosurface.vtp"

        return Response(payload)

    def perform_create(self, serializer):
        with transaction.atomic():
            instance = serializer.save(status=SimulationRun.StatusChoices.PENDING)
            
            # Setup directories for OpenFOAM in the shared volume
            if instance.asset and instance.asset.file:
                # Path should match the Docker volume mapping
                sim_dir = os.path.join(settings.BASE_DIR.parent, 'data', 'simulations', str(instance.id), 'constant', 'triSurface')
                os.makedirs(sim_dir, exist_ok=True)
                
                # Copy the asset into the OpenFOAM case.
                # OpenFOAM/snappyHexMesh consumes STL; for non-STL assets we copy as foil_input.<ext>
                # and let the worker convert to foil.stl during preflight.
                source_path = instance.asset.file.path
                _, ext = os.path.splitext(source_path)
                ext = (ext or '').lower()

                dest_input_path = os.path.join(sim_dir, f"foil_input{ext}")
                shutil.copy2(source_path, dest_input_path)

                if ext == '.stl':
                    shutil.copy2(source_path, os.path.join(sim_dir, 'foil.stl'))
            
            # Fire the Celery simulation task (orientation preview is now
            # handled client-side; the preview_stl_orientation task runs only
            # inside the simulation worker's pre-flight, not on every upload).
            transaction.on_commit(lambda: celery_app.send_task('tasks.run_hydro_simulation', args=[instance.id]))

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
