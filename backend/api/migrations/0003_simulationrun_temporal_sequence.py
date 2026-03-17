from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0002_simulationrun_mesh_density"),
    ]

    operations = [
        migrations.AddField(
            model_name="simulationrun",
            name="result_sequence_path",
            field=models.CharField(
                blank=True,
                help_text="Path to the temporal results manifest (JSON) for playback",
                max_length=512,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="simulationrun",
            name="frame_mapping",
            field=models.JSONField(
                default=list,
                help_text="List of per-frame mappings with URLs and metrics (frame_index -> iteration/time -> metrics)",
            ),
        ),
        migrations.AddField(
            model_name="simulationrun",
            name="metrics_series",
            field=models.JSONField(
                default=list,
                help_text="Per-frame metrics time-series aligned with frame_index for synchronized charts",
            ),
        ),
        migrations.AddField(
            model_name="simulationrun",
            name="convergence_series",
            field=models.JSONField(
                default=list,
                help_text="Residual/convergence series for the convergence plot",
            ),
        ),
    ]
