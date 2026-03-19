from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0008_add_moment_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='simulationrun',
            name='wall_yplus_max',
            field=models.FloatField(
                blank=True,
                null=True,
                help_text='Maximum wall y+ on foil surface',
            ),
        ),
        migrations.AddField(
            model_name='simulationrun',
            name='wall_yplus_mean',
            field=models.FloatField(
                blank=True,
                null=True,
                help_text='Mean wall y+ on foil surface',
            ),
        ),
    ]
