from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0006_add_layer_and_feature_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='simulationrun',
            name='enable_gravity',
            field=models.BooleanField(
                default=True,
                help_text='Enable gravity and use p_rgh pressure formulation',
            ),
        ),
    ]
