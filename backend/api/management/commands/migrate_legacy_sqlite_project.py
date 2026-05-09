import json
import sqlite3
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, models, transaction
from django.utils.dateparse import parse_datetime
from django.utils import timezone

from api.models import Folder, HydrofoilAsset, Project, SimulationRun, Team


class Command(BaseCommand):
    help = (
        "Migrate the legacy SQLite Legacy Team project data into the current database "
        "without copying media files."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--sqlite-path",
            default="/app/db.sqlite3",
            help="Path to the legacy SQLite database file inside the container.",
        )
        parser.add_argument(
            "--legacy-team-name",
            default="Legacy Team",
            help="Source team name in the legacy SQLite database.",
        )
        parser.add_argument(
            "--purge-target-projects",
            action="store_true",
            help="Delete existing projects under the target team before import.",
        )

    def handle(self, *args, **options):
        sqlite_path = Path(options["sqlite_path"])
        legacy_team_name = options["legacy_team_name"]
        purge_target_projects = options["purge_target_projects"]

        if not sqlite_path.exists():
            raise CommandError(f"SQLite database not found at {sqlite_path}")

        target_team = Team.objects.filter(name=legacy_team_name).first()
        if target_team is None:
            raise CommandError(
                f"Target team '{legacy_team_name}' does not exist in the current database."
            )

        sqlite_connection = sqlite3.connect(sqlite_path)
        sqlite_connection.row_factory = sqlite3.Row

        try:
            source_team = sqlite_connection.execute(
                "SELECT id, name FROM api_team WHERE name = ?",
                [legacy_team_name],
            ).fetchone()
            if source_team is None:
                raise CommandError(
                    f"Source team '{legacy_team_name}' does not exist in the legacy SQLite database."
                )

            source_projects = sqlite_connection.execute(
                "SELECT * FROM api_project WHERE team_id = ? ORDER BY id",
                [source_team["id"]],
            ).fetchall()
            if not source_projects:
                raise CommandError(
                    f"No projects found for '{legacy_team_name}' in the legacy SQLite database."
                )

            source_project_ids = [row["id"] for row in source_projects]
            source_folders = self._fetch_rows(
                sqlite_connection,
                "api_folder",
                "project_id IN ({})".format(
                    ", ".join(["?"] * len(source_project_ids))
                ),
                source_project_ids,
            )
            source_assets = self._fetch_rows(
                sqlite_connection,
                "api_hydrofoilasset",
                "project_id IN ({})".format(
                    ", ".join(["?"] * len(source_project_ids))
                ),
                source_project_ids,
            )
            source_runs = self._fetch_rows(
                sqlite_connection,
                "api_simulationrun",
                "project_id IN ({}) ORDER BY id".format(
                    ", ".join(["?"] * len(source_project_ids))
                ),
                source_project_ids,
            )

            self.stdout.write(
                self.style.NOTICE(
                    "Preparing to migrate "
                    f"{len(source_projects)} project(s), {len(source_folders)} folder(s), "
                    f"{len(source_assets)} asset(s), and {len(source_runs)} run(s)."
                )
            )

            with transaction.atomic():
                if purge_target_projects:
                    deleted, _ = target_team.projects.all().delete()
                    self.stdout.write(
                        self.style.WARNING(
                            f"Deleted {deleted} existing object(s) under target team '{target_team.name}'."
                        )
                    )
                else:
                    deleted = target_team.projects.filter(name="Default Project").delete()[0]
                    if deleted:
                        self.stdout.write(
                            self.style.WARNING(
                                f"Deleted {deleted} empty default object(s) under '{target_team.name}'."
                            )
                        )

                project_id_map = {}
                folder_id_map = {}
                asset_id_map = {}

                for source_project in source_projects:
                    project = self._upsert_model(
                        Project,
                        source_project,
                        overrides={"team_id": target_team.id},
                    )
                    project_id_map[source_project["id"]] = project.id

                for source_folder in source_folders:
                    folder = self._upsert_model(
                        Folder,
                        source_folder,
                        overrides={
                            "project_id": project_id_map[source_folder["project_id"]],
                            "parent_id": source_folder["parent_id"],
                        },
                    )
                    folder_id_map[source_folder["id"]] = folder.id

                for source_asset in source_assets:
                    folder_id = source_asset["folder_id"]
                    asset = self._upsert_model(
                        HydrofoilAsset,
                        source_asset,
                        overrides={
                            "project_id": project_id_map[source_asset["project_id"]],
                            "folder_id": folder_id_map.get(folder_id) if folder_id is not None else None,
                        },
                    )
                    asset_id_map[source_asset["id"]] = asset.id

                for source_run in source_runs:
                    asset_id = source_run["asset_id"]
                    self._upsert_model(
                        SimulationRun,
                        source_run,
                        overrides={
                            "project_id": project_id_map[source_run["project_id"]],
                            "asset_id": asset_id_map.get(asset_id) if asset_id is not None else None,
                        },
                    )

                self._reset_sequences([Project, Folder, HydrofoilAsset, SimulationRun])

            self.stdout.write(self.style.SUCCESS("Legacy SQLite project data migrated successfully."))
        finally:
            sqlite_connection.close()

    def _fetch_rows(self, sqlite_connection, table_name, where_clause, params):
        query = f"SELECT * FROM {table_name} WHERE {where_clause}"
        return sqlite_connection.execute(query, params).fetchall()

    def _upsert_model(self, model, source_row, overrides=None):
        overrides = overrides or {}
        object_id = overrides.get("id", source_row["id"])
        payload = {}
        timestamp_fields = {}

        for field in model._meta.concrete_fields:
            if field.auto_created:
                continue

            attname = field.attname
            value = overrides.get(attname, source_row[attname])

            if attname in {"created_at", "updated_at", "uploaded_at"}:
                timestamp_fields[attname] = self._convert_value(field, value)
                continue

            payload[attname] = self._convert_value(field, value)

        payload["id"] = object_id
        obj, _ = model.objects.update_or_create(id=object_id, defaults=payload)
        if timestamp_fields:
            model.objects.filter(pk=obj.pk).update(**timestamp_fields)
            obj.refresh_from_db()
        return obj

    def _convert_value(self, field, value):
        if value is None:
            return None

        if isinstance(field, models.JSONField):
            if value == "":
                return field.get_default()
            if isinstance(value, str):
                return json.loads(value)
            return value

        if isinstance(field, models.BooleanField):
            return bool(value)

        if isinstance(field, models.DateTimeField):
            if isinstance(value, str):
                value = parse_datetime(value)
            if value is not None and timezone.is_naive(value):
                return timezone.make_aware(value, timezone.get_current_timezone())
            return value

        return value

    def _reset_sequences(self, model_classes):
        with connection.cursor() as cursor:
            for model in model_classes:
                table_name = model._meta.db_table
                sequence_name = f"{table_name}_id_seq"
                cursor.execute(
                    f"SELECT setval(%s, COALESCE((SELECT MAX(id) FROM {table_name}), 1), true)",
                    [sequence_name],
                )