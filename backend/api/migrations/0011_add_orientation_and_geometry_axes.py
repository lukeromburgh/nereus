from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0010_add_postprocessing_result_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="simulationrun",
            name="pitch",
            field=models.FloatField(
                default=0.0,
                help_text="Pitch angle in degrees (rotation about Y axis)",
            ),
        ),
        migrations.AddField(
            model_name="simulationrun",
            name="roll",
            field=models.FloatField(
                default=0.0,
                help_text="Roll angle in degrees (rotation about X axis)",
            ),
        ),
        migrations.AddField(
            model_name="simulationrun",
            name="yaw",
            field=models.FloatField(
                default=0.0,
                help_text="Yaw angle in degrees (rotation about Z axis)",
            ),
        ),
        migrations.AddField(
            model_name="simulationrun",
            name="geometry_axes_detected",
            field=models.JSONField(
                default=dict,
                blank=True,
                help_text="OBB axis mapping detected during STL orientation normalisation",
            ),
        ),
    ]
