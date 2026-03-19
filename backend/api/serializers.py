from rest_framework import serializers
from django.conf import settings
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
    visualization_urls = serializers.SerializerMethodField()

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
            'cl',
            'cd',
            'l_d_ratio',
            'cm_pitch',
            'roll_moment',
            'yaw_moment',
            'wall_yplus_max',
            'wall_yplus_mean',
            'cavitation_risk',
            'sigma',
            'cavitation_onset_x_over_c',
            'cavitating_surface_fraction',
            'vortex_decay_rate',
            'omega_0',
            'x_over_c_10pct_decay',
            'file_manifest',
            'geometry_axes_detected',
            'orientation_preview_url',
            'geometry_dimensions',
        ]

    def get_visualization_urls(self, obj):
        manifest = obj.file_manifest
        if not manifest:
            return {}
        request = self.context.get('request')
        if request is None:
            return manifest

        def _to_absolute(path):
            return request.build_absolute_uri(settings.MEDIA_URL + path.lstrip('/'))

        result = {}
        for key, value in manifest.items():
            if isinstance(value, list):
                result[key] = [_to_absolute(p) for p in value]
            elif isinstance(value, str):
                result[key] = _to_absolute(value)
            else:
                result[key] = value
        return result

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
