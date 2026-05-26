from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Integer, String, Text, Time

from .database import Base


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    start_time = Column(DateTime, nullable=False, index=True)
    end_time = Column(DateTime, nullable=True)
    location = Column(String(255), nullable=True)
    completed = Column(Boolean, nullable=False, default=False)
    source = Column(String(50), nullable=False, default="mobile")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class TodoTask(Base):
    __tablename__ = "todo_tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    date = Column(Date, nullable=False, index=True)
    due_time = Column(Time, nullable=True)
    priority = Column(String(20), nullable=False, default="medium")
    completed = Column(Boolean, nullable=False, default=False)
    source = Column(String(50), nullable=False, default="mobile")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class NowPlayingState(Base):
    __tablename__ = "now_playing_state"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=True)
    artist = Column(String(255), nullable=True)
    album = Column(String(255), nullable=True)
    source = Column(String(50), nullable=False, default="other")
    is_playing = Column(Boolean, nullable=False, default=False)
    progress_seconds = Column(Integer, nullable=False, default=0)
    duration_seconds = Column(Integer, nullable=True)
    artwork_url = Column(String(1024), nullable=True)
    track_url = Column(String(1024), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class MirrorModuleSettings(Base):
    __tablename__ = "mirror_module_settings"

    id = Column(Integer, primary_key=True, index=True)
    date_enabled = Column(Boolean, nullable=False, default=True)
    reminders_enabled = Column(Boolean, nullable=False, default=True)
    calendar_enabled = Column(Boolean, nullable=False, default=True)
    temperature_enabled = Column(Boolean, nullable=False, default=True)
    humidity_enabled = Column(Boolean, nullable=False, default=True)
    pressure_enabled = Column(Boolean, nullable=False, default=True)
    spotify_enabled = Column(Boolean, nullable=False, default=True)
    youtube_enabled = Column(Boolean, nullable=False, default=True)
    weather_refresh_requested_at = Column(DateTime, nullable=True)
    mirror_refresh_requested_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
