from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0003_simulationrun_temporal_sequence"),
    ]

    operations = [
        migrations.AddField(
            model_name="simulationrun",
            name="slice_axis",
            field=models.CharField(
                choices=[("x", "X"), ("y", "Y"), ("z", "Z")],
                default="y",
                help_text="Axis normal for the exported analysis slice (x/y/z)",
                max_length=1,
            ),
        ),
    ]
