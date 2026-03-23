import os
import shutil
from rest_framework import viewsets, parsers, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.conf import settings
from .models import HydrofoilAsset, Project, SimulationRun
from .serializers import HydrofoilAssetSerializer, ProjectSerializer, SimulationRunSerializer
from django.db import transaction

# Using celery explicitly to dispatch tasks dynamically or via proxy task
from .tasks import run_hydro_simulation

class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer

class HydrofoilAssetViewSet(viewsets.ModelViewSet):
    queryset = HydrofoilAsset.objects.all()
    serializer_class = HydrofoilAssetSerializer
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

class SimulationRunViewSet(viewsets.ModelViewSet):
    queryset = SimulationRun.objects.all()
    serializer_class = SimulationRunSerializer

    @action(detail=True, methods=['get'])
    def analysis(self, request, pk=None):
        run = self.get_object()

        # Keep the payload explicit and stable for the frontend sync-loop.
        # Include direct VTP overlay helpers for pressure/vorticity/flow highlighting.
        return Response(
            {
                'id': run.id,
                'status': run.status,
                'result_sequence_path': run.result_sequence_path,
                'frame_mapping': run.frame_mapping or [],
                'metrics_series': run.metrics_series or [],
                'convergence_series': run.convergence_series or [],
                'skin_friction_lines_path': f"/media/simulations/{run.id}/skin_friction_lines.vtp",
                'q_criterion_isosurface_path': f"/media/simulations/{run.id}/q_criterion_isosurface.vtp",
            }
        )

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
            transaction.on_commit(lambda: run_hydro_simulation.delay(instance.id))
