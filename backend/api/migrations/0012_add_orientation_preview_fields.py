from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0011_add_orientation_and_geometry_axes"),
    ]

    operations = [
        migrations.AddField(
            model_name="simulationrun",
            name="orientation_preview_url",
            field=models.CharField(
                max_length=500,
                blank=True,
                default="",
                help_text="Relative media URL of the orientation preview GLB",
            ),
        ),
        migrations.AddField(
            model_name="simulationrun",
            name="geometry_dimensions",
            field=models.JSONField(
                default=dict,
                blank=True,
                help_text="Bounding-box dimensions after normalisation {chord_m, span_m, thickness_m}",
            ),
        ),
    ]
