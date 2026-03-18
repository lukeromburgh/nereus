from django.db import models

class Project(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class HydrofoilAsset(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='assets')
    name = models.CharField(max_length=255)
    file = models.FileField(upload_to='assets/hydrofoils/')
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

    # Meshing
    mesh_density = models.FloatField(
        default=1.0,
        help_text="Dimensionless base-mesh density multiplier (higher = finer base mesh)",
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

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"SimulationRun {self.id} for Project {self.project.name} - {self.status}"