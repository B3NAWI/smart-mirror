from typing import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from .config import DATABASE_URL

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_database() -> None:
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    if DATABASE_URL.startswith("sqlite"):
        with engine.begin() as connection:
            calendar_columns = {
                row[1]
                for row in connection.execute(text("PRAGMA table_info(calendar_events)")).fetchall()
            }
            if "completed" not in calendar_columns:
                connection.execute(
                    text(
                        "ALTER TABLE calendar_events "
                        "ADD COLUMN completed BOOLEAN NOT NULL DEFAULT 0"
                    )
                )

            module_table_exists = connection.execute(
                text(
                    "SELECT name FROM sqlite_master "
                    "WHERE type = 'table' AND name = 'mirror_module_settings'"
                )
            ).fetchone()
            if module_table_exists:
                module_columns = {
                    row[1]
                    for row in connection.execute(
                        text("PRAGMA table_info(mirror_module_settings)")
                    ).fetchall()
                }
                if "weather_enabled" not in module_columns:
                    connection.execute(
                        text(
                            "ALTER TABLE mirror_module_settings "
                            "ADD COLUMN weather_enabled BOOLEAN NOT NULL DEFAULT 1"
                        )
                    )
                if "weather_refresh_requested_at" not in module_columns:
                    connection.execute(
                        text(
                            "ALTER TABLE mirror_module_settings "
                            "ADD COLUMN weather_refresh_requested_at DATETIME"
                        )
                    )
                if "mirror_refresh_requested_at" not in module_columns:
                    connection.execute(
                        text(
                            "ALTER TABLE mirror_module_settings "
                            "ADD COLUMN mirror_refresh_requested_at DATETIME"
                        )
                    )
                if "gesture_camera_enabled" not in module_columns:
                    connection.execute(
                        text(
                            "ALTER TABLE mirror_module_settings "
                            "ADD COLUMN gesture_camera_enabled BOOLEAN NOT NULL DEFAULT 0"
                        )
                    )

            planner_segment_table_exists = connection.execute(
                text(
                    "SELECT name FROM sqlite_master "
                    "WHERE type = 'table' AND name = 'planner_segments'"
                )
            ).fetchone()
            if planner_segment_table_exists:
                planner_segment_columns = {
                    row[1]
                    for row in connection.execute(
                        text("PRAGMA table_info(planner_segments)")
                    ).fetchall()
                }
                if "backend_event_id" not in planner_segment_columns:
                    connection.execute(
                        text(
                            "ALTER TABLE planner_segments "
                            "ADD COLUMN backend_event_id VARCHAR(64) NOT NULL DEFAULT ''"
                        )
                    )
                if "alarm_at_start" not in planner_segment_columns:
                    connection.execute(
                        text(
                            "ALTER TABLE planner_segments "
                            "ADD COLUMN alarm_at_start BOOLEAN NOT NULL DEFAULT 0"
                        )
                    )
                if "alarm_at_end" not in planner_segment_columns:
                    connection.execute(
                        text(
                            "ALTER TABLE planner_segments "
                            "ADD COLUMN alarm_at_end BOOLEAN NOT NULL DEFAULT 0"
                        )
                    )
