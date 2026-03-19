from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0009_add_wall_yplus_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="simulationrun",
            name="cl",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="simulationrun",
            name="cd",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="simulationrun",
            name="l_d_ratio",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="simulationrun",
            name="cm_pitch",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="simulationrun",
            name="cavitation_risk",
            field=models.BooleanField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="simulationrun",
            name="sigma",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="simulationrun",
            name="cavitation_onset_x_over_c",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="simulationrun",
            name="cavitating_surface_fraction",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="simulationrun",
            name="vortex_decay_rate",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="simulationrun",
            name="omega_0",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="simulationrun",
            name="x_over_c_10pct_decay",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="simulationrun",
            name="file_manifest",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
