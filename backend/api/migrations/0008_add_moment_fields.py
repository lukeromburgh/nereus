from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0007_add_enable_gravity'),
    ]

    operations = [
        migrations.AddField(
            model_name='simulationrun',
            name='pitch_moment',
            field=models.FloatField(
                blank=True,
                null=True,
                help_text='Pitch moment (My) averaged over last 20% of iterations, N·m',
            ),
        ),
        migrations.AddField(
            model_name='simulationrun',
            name='roll_moment',
            field=models.FloatField(
                blank=True,
                null=True,
                help_text='Roll moment (Mx) averaged over last 20% of iterations, N·m',
            ),
        ),
        migrations.AddField(
            model_name='simulationrun',
            name='yaw_moment',
            field=models.FloatField(
                blank=True,
                null=True,
                help_text='Yaw moment (Mz) averaged over last 20% of iterations, N·m',
            ),
        ),
    ]
