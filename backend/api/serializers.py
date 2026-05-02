from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.conf import settings
from .models import Folder, HydrofoilAsset, Project, SimulationRun, Team
from .access import get_user_teams, user_can_access_project


User = get_user_model()


class TeamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = ['id', 'name']


class CurrentUserSerializer(serializers.ModelSerializer):
    teams = TeamSerializer(many=True, read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'teams']


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(trim_whitespace=False)

class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

    def validate(self, data):
        request = self.context.get('request')
        team = data.get('team') or (self.instance and self.instance.team)

        if request is None or request.user.is_superuser:
            return data

        user_teams = get_user_teams(request.user)
        if team is None:
            team = user_teams.order_by('id').first()
            if team is None:
                raise serializers.ValidationError({'team': 'You must belong to a team before creating a project.'})
            data['team'] = team
        elif not user_teams.filter(id=team.id).exists():
            raise serializers.ValidationError({'team': 'Project team must be one of your teams.'})

        return data

class HydrofoilAssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = HydrofoilAsset
        fields = ['id', 'project', 'name', 'file', 'folder', 'uploaded_at']
        read_only_fields = ['uploaded_at']

    def validate_file(self, value):
        max_size = 100 * 1024 * 1024  # 100 MB
        if value.size > max_size:
            raise serializers.ValidationError(
                f"File too large ({value.size / 1024 / 1024:.1f} MB). Maximum is 100 MB."
            )
        if value.size == 0:
            raise serializers.ValidationError("Uploaded file is empty.")
        return value

    def validate(self, data):
        request = self.context.get('request')
        folder = data.get('folder')
        project = data.get('project') or (self.instance and self.instance.project)

        if request is not None and not request.user.is_superuser and project is not None:
            if not user_can_access_project(request.user, project):
                raise serializers.ValidationError({'project': 'You do not have access to this project.'})

        if folder and project and folder.project_id != project.id:
            raise serializers.ValidationError(
                {"folder": "Folder must belong to the same project as the asset."}
            )
        return data


class FolderSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()
    assets = serializers.SerializerMethodField()
    asset_count = serializers.SerializerMethodField()

    class Meta:
        model = Folder
        fields = [
            'id', 'project', 'name', 'parent',
            'children', 'assets', 'asset_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_children(self, obj):
        return FolderSerializer(obj.children.all(), many=True, context=self.context).data

    def get_assets(self, obj):
        return HydrofoilAssetSerializer(obj.assets.all(), many=True, context=self.context).data

    def get_asset_count(self, obj):
        count = obj.assets.count()
        for child in obj.children.all():
            count += self.get_asset_count(child)
        return count

    def validate(self, data):
        request = self.context.get('request')
        # Prevent duplicate folder names at the same level within a project
        project = data.get('project') or (self.instance and self.instance.project)
        parent = data.get('parent', self.instance.parent if self.instance else None)
        name = data.get('name', self.instance.name if self.instance else None)

        if request is not None and not request.user.is_superuser and project is not None:
            if not user_can_access_project(request.user, project):
                raise serializers.ValidationError({'project': 'You do not have access to this project.'})

        if project and name:
            qs = Folder.objects.filter(project=project, parent=parent, name=name)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {"name": "A folder with this name already exists at this level."}
                )
        return data

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

    def validate(self, data):
        request = self.context.get('request')
        project = data.get('project') or (self.instance and self.instance.project)
        asset = data.get('asset') or (self.instance and self.instance.asset)

        if request is not None and not request.user.is_superuser and project is not None:
            if not user_can_access_project(request.user, project):
                raise serializers.ValidationError({'project': 'You do not have access to this project.'})

        if asset is not None and project is not None and asset.project_id != project.id:
            raise serializers.ValidationError({'asset': 'Asset must belong to the selected project.'})

        return data

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
