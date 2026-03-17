from rest_framework import serializers
from .models import HydrofoilAsset, Project, SimulationRun

class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = '__all__'

class HydrofoilAssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = HydrofoilAsset
        fields = ['id', 'project', 'name', 'file', 'uploaded_at']
        read_only_fields = ['uploaded_at']

class SimulationRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = SimulationRun
        fields = '__all__'
        read_only_fields = ['status', 'created_at', 'updated_at', 'current_logs', 'result_mesh_path']

    # For internal service/worker patching, allow status and logs
    def update(self, instance, validated_data):
        if 'status' in self.initial_data:
            instance.status = self.initial_data['status']
        if 'current_logs' in self.initial_data:
            instance.current_logs = self.initial_data['current_logs']
        if 'result_mesh_path' in self.initial_data:
            instance.result_mesh_path = self.initial_data['result_mesh_path']
        return super().update(instance, validated_data)
