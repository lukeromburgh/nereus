import os
import shutil
from rest_framework import viewsets, parsers, status
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

    def perform_create(self, serializer):
        with transaction.atomic():
            instance = serializer.save(status=SimulationRun.StatusChoices.PENDING)
            
            # Setup directories for OpenFOAM in the shared volume
            if instance.asset and instance.asset.file:
                # Path should match the Docker volume mapping
                sim_dir = os.path.join(settings.BASE_DIR.parent, 'data', 'simulations', str(instance.id), 'constant', 'triSurface')
                os.makedirs(sim_dir, exist_ok=True)
                
                # Copy the STL from MEDIA_ROOT to the OpenFOAM designated location
                source_path = instance.asset.file.path
                dest_path = os.path.join(sim_dir, 'foil.stl')
                shutil.copy2(source_path, dest_path)
            
            # Initiate Celery Handshake
            transaction.on_commit(lambda: run_hydro_simulation.delay(instance.id))
