from django.db import models
from django.conf import settings
from django.core.validators import FileExtensionValidator
from django.utils import timezone
import secrets
from datetime import timedelta


def generate_invite_token():
    return secrets.token_urlsafe(24)


def default_invite_expiry():
    return timezone.now() + timedelta(days=14)


class Team(models.Model):
    name = models.CharField(max_length=255, unique=True)
    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through='TeamMembership',
        related_name='teams',
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class TeamMembership(models.Model):
    class RoleChoices(models.TextChoices):
        VIEWER = 'viewer', 'Viewer'
        ENGINEER = 'engineer', 'Engineer'
        TEAM_ADMIN = 'team_admin', 'Team Admin'

    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='team_memberships',
    )
    role = models.CharField(
        max_length=24,
        choices=RoleChoices.choices,
        default=RoleChoices.TEAM_ADMIN,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'api_team_members'
        ordering = ['team_id', 'user_id']
        unique_together = ('team', 'user')

    def __str__(self):
        return f"{self.user} in {self.team} ({self.role})"


class TeamInvite(models.Model):
    class StatusChoices(models.TextChoices):
        PENDING = 'pending', 'Pending'
        ACCEPTED = 'accepted', 'Accepted'
        REVOKED = 'revoked', 'Revoked'
        EXPIRED = 'expired', 'Expired'

    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='invites')
    email = models.EmailField()
    role = models.CharField(
        max_length=24,
        choices=TeamMembership.RoleChoices.choices,
        default=TeamMembership.RoleChoices.VIEWER,
    )
    token = models.CharField(max_length=64, unique=True, default=generate_invite_token, editable=False)
    status = models.CharField(
        max_length=24,
        choices=StatusChoices.choices,
        default=StatusChoices.PENDING,
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sent_team_invites',
    )
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='accepted_team_invites',
    )
    expires_at = models.DateTimeField(default=default_invite_expiry)
    last_sent_at = models.DateTimeField(null=True, blank=True)
    send_count = models.PositiveIntegerField(default=0)
    delivery_error = models.CharField(max_length=500, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Invite {self.email} to {self.team}"

    def save(self, *args, **kwargs):
        self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    def has_expired(self):
        return self.status == self.StatusChoices.PENDING and timezone.now() >= self.expires_at

    def refresh_status(self, save=True):
        if self.has_expired():
            self.status = self.StatusChoices.EXPIRED
            if save:
                self.save(update_fields=['status', 'updated_at'])
        return self.status

    def accept(self, user):
        self.refresh_status(save=True)
        if self.status != self.StatusChoices.PENDING:
            raise ValueError('Invite is not active.')

        self.status = self.StatusChoices.ACCEPTED
        self.accepted_by = user
        self.accepted_at = timezone.now()
        self.save(update_fields=['status', 'accepted_by', 'accepted_at', 'updated_at'])

    def revoke(self):
        self.refresh_status(save=True)
        if self.status != self.StatusChoices.PENDING:
            raise ValueError('Invite is not active.')

        self.status = self.StatusChoices.REVOKED
        self.revoked_at = timezone.now()
        self.save(update_fields=['status', 'revoked_at', 'updated_at'])

    def reactivate(self):
        self.token = generate_invite_token()
        self.status = self.StatusChoices.PENDING
        self.expires_at = default_invite_expiry()
        self.accepted_at = None
        self.accepted_by = None
        self.revoked_at = None
        self.delivery_error = ''
        self.save(
            update_fields=[
                'token',
                'status',
                'expires_at',
                'accepted_at',
                'accepted_by',
                'revoked_at',
                'delivery_error',
                'updated_at',
            ]
        )

class Project(models.Model):
    team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name='projects',
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class Folder(models.Model):
    """Hierarchical folder for organising assets within a project."""
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='folders')
    name = models.CharField(max_length=255)
    parent = models.ForeignKey(
        'self', on_delete=models.CASCADE, null=True, blank=True, related_name='children',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class HydrofoilAsset(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='assets')
    name = models.CharField(max_length=255)
    file = models.FileField(
        upload_to='assets/hydrofoils/',
        validators=[FileExtensionValidator(allowed_extensions=['stl', 'obj', 'gltf', 'glb'])],
    )
    folder = models.ForeignKey(
        Folder, on_delete=models.SET_NULL, null=True, blank=True, related_name='assets',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class SimulationRun(models.Model):
    class StatusChoices(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        MESHING = 'MESHING', 'Meshing'
        RUNNING = 'RUNNING', 'Running'
        COMPLETED = 'COMPLETED', 'Completed'
        FAILED = 'FAILED', 'Failed'
        CANCELLED = 'CANCELLED', 'Cancelled'

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='simulation_runs')
    asset = models.ForeignKey(HydrofoilAsset, on_delete=models.CASCADE, related_name='simulation_runs', null=True, blank=True)

    # Vehicle Config
    mass = models.FloatField(help_text="Mass of the vehicle in kg")
    payload_weight = models.FloatField(help_text="Payload weight in kg")
    center_of_gravity = models.JSONField(help_text="Center of gravity as an array [x, y, z]", default=list)

    # Operating Conditions
    velocity = models.FloatField(help_text="Velocity in m/s")
    angle_of_attack = models.FloatField(help_text="Angle of attack in degrees")

    # Environment
    water_density = models.FloatField(default=1025.0, help_text="Water density in kg/m^3 (default 1025 for seawater)")
    wave_height = models.FloatField(help_text="Wave height in meters")
    submersion_depth = models.FloatField(
        default=0.5,
        help_text="Depth of the foil center below the water surface in meters",
    )

    # Physics
    enable_gravity = models.BooleanField(
        default=True,
        help_text="Enable gravity and use p_rgh pressure formulation",
    )

    # Meshing
    mesh_density = models.FloatField(
        default=1.0,
        help_text="Dimensionless base-mesh density multiplier (higher = finer base mesh)",
    )
    enable_layers = models.BooleanField(
        default=True,
        help_text="Enable boundary layer addition in snappyHexMesh",
    )
    n_surface_layers = models.IntegerField(
        default=5,
        help_text="Number of boundary layers on the foil surface",
    )
    layer_expansion = models.FloatField(
        default=1.2,
        help_text="Expansion ratio between successive boundary layers",
    )
    feature_level = models.IntegerField(
        default=4,
        help_text="Refinement level for feature edges extracted by surfaceFeatureExtract",
    )

    # Orientation correction (user-supplied, degrees)
    pitch = models.FloatField(
        default=0.0,
        help_text="Pitch angle in degrees (rotation about Y axis)",
    )
    roll = models.FloatField(
        default=0.0,
        help_text="Roll angle in degrees (rotation about X axis)",
    )
    yaw = models.FloatField(
        default=0.0,
        help_text="Yaw angle in degrees (rotation about Z axis)",
    )

    # Orientation preview
    orientation_preview_url = models.CharField(
        max_length=500,
        blank=True,
        help_text="Relative media URL of the orientation preview GLB",
    )
    geometry_dimensions = models.JSONField(
        default=dict,
        blank=True,
        help_text="Bounding-box dimensions after normalisation {chord_m, span_m, thickness_m}",
    )

    # Diagnostic: which original OBB axis was mapped to X/Y/Z
    geometry_axes_detected = models.JSONField(
        default=dict,
        blank=True,
        help_text="OBB axis mapping detected during STL orientation normalisation",
    )

    # Post-processing / slicing
    slice_axis = models.CharField(
        max_length=1,
        choices=[('x', 'X'), ('y', 'Y'), ('z', 'Z')],
        default='y',
        help_text="Axis normal for the exported analysis slice (x/y/z)",
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=StatusChoices.choices,
        default=StatusChoices.PENDING
    )
    celery_task_id = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Celery task id for run lifecycle control",
    )
    
    current_logs = models.TextField(blank=True, null=True, help_text="Last 5 lines of solver output")
    result_mesh_path = models.CharField(max_length=512, blank=True, null=True, help_text="Path to the reduced GLTF result")

    # Temporal results ("Temporal Geometry Pipeline")
    # `frame_mapping` is the authoritative sync-map between frame_index -> iteration/time -> metrics.
    result_sequence_path = models.CharField(
        max_length=512,
        blank=True,
        null=True,
        help_text="Path to the temporal results manifest (JSON) for playback",
    )
    frame_mapping = models.JSONField(
        default=list,
        help_text="List of per-frame mappings with URLs and metrics (frame_index -> iteration/time -> metrics)",
    )
    metrics_series = models.JSONField(
        default=list,
        help_text="Per-frame metrics time-series aligned with frame_index for synchronized charts",
    )
    convergence_series = models.JSONField(
        default=list,
        help_text="Residual/convergence series for the convergence plot",
    )

    # Wall y+ results from post-processing
    wall_yplus_max = models.FloatField(
        null=True, blank=True,
        help_text="Maximum wall y+ on foil surface",
    )
    wall_yplus_mean = models.FloatField(
        null=True, blank=True,
        help_text="Mean wall y+ on foil surface",
    )

    # Moment results from post-processing
    pitch_moment = models.FloatField(
        null=True, blank=True,
        help_text="Pitch moment (My) averaged over last 20% of iterations, N·m",
    )
    roll_moment = models.FloatField(
        null=True, blank=True,
        help_text="Roll moment (Mx) averaged over last 20% of iterations, N·m",
    )
    yaw_moment = models.FloatField(
        null=True, blank=True,
        help_text="Yaw moment (Mz) averaged over last 20% of iterations, N·m",
    )

    # Scalar results from post-processing pipeline
    cl = models.FloatField(null=True, blank=True)
    cd = models.FloatField(null=True, blank=True)
    l_d_ratio = models.FloatField(null=True, blank=True)
    cm_pitch = models.FloatField(null=True, blank=True)
    cavitation_risk = models.BooleanField(null=True, blank=True)
    sigma = models.FloatField(null=True, blank=True)
    cavitation_onset_x_over_c = models.FloatField(null=True, blank=True)
    cavitating_surface_fraction = models.FloatField(null=True, blank=True)
    vortex_decay_rate = models.FloatField(null=True, blank=True)
    omega_0 = models.FloatField(null=True, blank=True)
    x_over_c_10pct_decay = models.FloatField(null=True, blank=True)
    file_manifest = models.JSONField(default=dict, blank=True)
    mesh_diagnostics = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"SimulationRun {self.id} for Project {self.project.name} - {self.status}"