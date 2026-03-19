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
        read_only_fields = [
            'status',
            'created_at',
            'updated_at',
            'current_logs',
            'result_mesh_path',
            'result_sequence_path',
            'frame_mapping',
            'metrics_series',
            'convergence_series',
        ]

    # For internal service/worker patching, allow status and logs
    def update(self, instance, validated_data):
        if 'status' in self.initial_data:
            instance.status = self.initial_data['status']
        if 'current_logs' in self.initial_data:
            instance.current_logs = self.initial_data['current_logs']
        if 'result_mesh_path' in self.initial_data:
            instance.result_mesh_path = self.initial_data['result_mesh_path']
        if 'result_sequence_path' in self.initial_data:
            instance.result_sequence_path = self.initial_data['result_sequence_path']
        if 'frame_mapping' in self.initial_data:
            instance.frame_mapping = self.initial_data['frame_mapping']
        if 'metrics_series' in self.initial_data:
            instance.metrics_series = self.initial_data['metrics_series']
        if 'convergence_series' in self.initial_data:
            instance.convergence_series = self.initial_data['convergence_series']
        if 'pitch_moment' in self.initial_data:
            instance.pitch_moment = self.initial_data['pitch_moment']
        if 'roll_moment' in self.initial_data:
            instance.roll_moment = self.initial_data['roll_moment']
        if 'yaw_moment' in self.initial_data:
            instance.yaw_moment = self.initial_data['yaw_moment']
        if 'wall_yplus_max' in self.initial_data:
            instance.wall_yplus_max = self.initial_data['wall_yplus_max']
        if 'wall_yplus_mean' in self.initial_data:
            instance.wall_yplus_mean = self.initial_data['wall_yplus_mean']
        return super().update(instance, validated_data)
