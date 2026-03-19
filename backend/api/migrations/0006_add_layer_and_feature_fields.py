from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0005_add_submersion_depth'),
    ]

    operations = [
        migrations.AddField(
            model_name='simulationrun',
            name='enable_layers',
            field=models.BooleanField(default=True, help_text='Enable boundary layer addition in snappyHexMesh'),
        ),
        migrations.AddField(
            model_name='simulationrun',
            name='n_surface_layers',
            field=models.IntegerField(default=5, help_text='Number of boundary layers on the foil surface'),
        ),
        migrations.AddField(
            model_name='simulationrun',
            name='layer_expansion',
            field=models.FloatField(default=1.2, help_text='Expansion ratio between successive boundary layers'),
        ),
        migrations.AddField(
            model_name='simulationrun',
            name='feature_level',
            field=models.IntegerField(default=4, help_text='Refinement level for feature edges extracted by surfaceFeatureExtract'),
        ),
    ]
