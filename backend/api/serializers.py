from rest_framework import serializers
from rest_framework.permissions import SAFE_METHODS
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth import get_user_model
from django.conf import settings
from django.utils import timezone
from .models import Folder, HydrofoilAsset, Project, SimulationRun, Team, TeamInvite, TeamMembership
from .access import (
    build_username_from_email,
    get_team_membership,
    get_user_teams,
    get_user_by_email,
    user_can_access_project,
    user_can_edit_team_resources,
    user_can_manage_team,
)


User = get_user_model()


class TeamSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()
    project_count = serializers.SerializerMethodField()

    class Meta:
        model = Team
        fields = ['id', 'name', 'role', 'member_count', 'project_count']

    def get_role(self, obj):
        request = self.context.get('request')
        if request is None:
            return None
        if request.user.is_superuser:
            return TeamMembership.RoleChoices.TEAM_ADMIN

        membership = get_team_membership(request.user, obj)
        return membership.role if membership is not None else None

    def get_member_count(self, obj):
        return obj.memberships.count()

    def get_project_count(self, obj):
        return obj.projects.count()


class TeamProjectSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ['id', 'name', 'description', 'created_at', 'updated_at']


class TeamInviteSerializer(serializers.ModelSerializer):
    invite_url = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    invited_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TeamInvite
        fields = [
            'id',
            'email',
            'role',
            'status',
            'invite_url',
            'expires_at',
            'last_sent_at',
            'send_count',
            'delivery_error',
            'created_at',
            'updated_at',
            'invited_by_name',
        ]

    def get_invite_url(self, obj):
        base = getattr(settings, 'FRONTEND_APP_URL', '').rstrip('/')
        if not base:
            return f"/join/{obj.token}"
        return f"{base}/join/{obj.token}"

    def get_status(self, obj):
        if obj.has_expired():
            return TeamInvite.StatusChoices.EXPIRED
        return obj.status

    def get_invited_by_name(self, obj):
        if obj.invited_by is None:
            return None
        full_name = f"{obj.invited_by.first_name} {obj.invited_by.last_name}".strip()
        return full_name or obj.invited_by.username


class TeamInviteCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeamInvite
        fields = ['email', 'role']

    def validate_email(self, value):
        return value.strip().lower()

    def validate(self, data):
        request = self.context.get('request')
        team = self.context.get('team')
        email = data.get('email', '').strip().lower()

        if request is None or team is None:
            raise serializers.ValidationError('Invite context is incomplete.')

        if not user_can_manage_team(request.user, team):
            raise serializers.ValidationError('You do not have permission to invite members to this team.')

        if TeamMembership.objects.filter(team=team, user__email__iexact=email).exists():
            raise serializers.ValidationError({'email': 'A member with this email already belongs to the team.'})

        has_pending_invite = TeamInvite.objects.filter(
            team=team,
            email__iexact=email,
            status=TeamInvite.StatusChoices.PENDING,
            expires_at__gt=timezone.now(),
        ).exists()
        if has_pending_invite:
            raise serializers.ValidationError({'email': 'A pending invite already exists for this email.'})

        return data

    def create(self, validated_data):
        request = self.context['request']
        team = self.context['team']
        return TeamInvite.objects.create(
            team=team,
            invited_by=request.user,
            **validated_data,
        )


class TeamInvitePreviewSerializer(serializers.ModelSerializer):
    team = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    existing_account = serializers.SerializerMethodField()

    class Meta:
        model = TeamInvite
        fields = ['id', 'email', 'role', 'status', 'expires_at', 'team', 'existing_account']

    def get_team(self, obj):
        return {
            'id': obj.team_id,
            'name': obj.team.name,
        }

    def get_status(self, obj):
        if obj.has_expired():
            return TeamInvite.StatusChoices.EXPIRED
        return obj.status

    def get_existing_account(self, obj):
        return get_user_by_email(obj.email) is not None


class TeamInviteSignupSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    password = serializers.CharField(trim_whitespace=False, write_only=True)
    password_confirm = serializers.CharField(trim_whitespace=False, write_only=True)

    def validate(self, data):
        invite = self.context.get('invite')
        if invite is None:
            raise serializers.ValidationError('Invite context is incomplete.')

        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'Passwords do not match.'})

        if get_user_by_email(invite.email) is not None:
            raise serializers.ValidationError({'email': 'An account already exists for this email. Sign in to accept the invite.'})

        prototype = User(
            username=build_username_from_email(invite.email),
            email=invite.email,
            first_name=data.get('first_name', '').strip(),
            last_name=data.get('last_name', '').strip(),
        )
        validate_password(data['password'], user=prototype)
        return data


class TeamMemberSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)

    class Meta:
        model = TeamMembership
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'role',
            'created_at',
            'updated_at',
        ]


class TeamMembershipUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=TeamMembership.RoleChoices.choices)


class TeamDetailSerializer(TeamSerializer):
    members = TeamMemberSerializer(source='memberships', many=True, read_only=True)
    projects = TeamProjectSummarySerializer(many=True, read_only=True)
    invites = serializers.SerializerMethodField()

    class Meta(TeamSerializer.Meta):
        fields = TeamSerializer.Meta.fields + ['members', 'projects', 'invites']

    def get_invites(self, obj):
        request = self.context.get('request')
        if request is None or not user_can_manage_team(request.user, obj):
            return []

        invites = obj.invites.select_related('invited_by').all()
        return TeamInviteSerializer(invites, many=True, context=self.context).data


class TeamUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = ['id', 'name', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class CurrentUserSerializer(serializers.ModelSerializer):
    teams = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'is_superuser', 'teams']

    def get_teams(self, obj):
        teams = get_user_teams(obj).order_by('name')
        return TeamSerializer(teams, many=True, context=self.context).data


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

        if request.method not in SAFE_METHODS and not user_can_edit_team_resources(request.user, team):
            raise serializers.ValidationError({'team': 'You do not have permission to create or modify projects for this team.'})

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
            if request.method not in SAFE_METHODS and not user_can_edit_team_resources(request.user, project.team):
                raise serializers.ValidationError({'project': 'You do not have permission to modify assets for this project.'})

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
            if request.method not in SAFE_METHODS and not user_can_edit_team_resources(request.user, project.team):
                raise serializers.ValidationError({'project': 'You do not have permission to modify folders for this project.'})

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
            if request.method not in SAFE_METHODS and not user_can_edit_team_resources(request.user, project.team):
                raise serializers.ValidationError({'project': 'You do not have permission to create or modify runs for this project.'})

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
        request = self.context.get('request')
        if request is not None and not request.user.is_superuser and not user_can_edit_team_resources(request.user, instance.project.team):
            raise serializers.ValidationError({'project': 'You do not have permission to update this run.'})

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
