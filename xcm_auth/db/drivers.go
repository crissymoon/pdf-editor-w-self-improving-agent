package db

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/jackc/pgx/v5/stdlib"
)

// OpenMySQL opens a MySQL database and returns a Store implementation.
func OpenMySQL(dsn string) (*SQLiteStore, error) {
	if dsn == "" {
		return nil, fmt.Errorf("[db/mysql] empty DSN")
	}
	sqlDB, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("[db/mysql] open: %w", err)
	}
	rdb := &rebindDB{raw: sqlDB, style: placeholderStyleForDialect("mysql")}
	if err := rdb.Ping(); err != nil {
		return nil, fmt.Errorf("[db/mysql] ping: %w", err)
	}
	log.Printf("[db/mysql] opened database")
	return &SQLiteStore{db: rdb, dialect: "mysql"}, nil
}

// OpenPostgres opens a Postgres database and returns a Store implementation.
func OpenPostgres(dsn string) (*SQLiteStore, error) {
	if dsn == "" {
		return nil, fmt.Errorf("[db/postgres] empty DSN")
	}
	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("[db/postgres] open: %w", err)
	}
	rdb := &rebindDB{raw: sqlDB, style: placeholderStyleForDialect("postgres")}
	if err := rdb.Ping(); err != nil {
		return nil, fmt.Errorf("[db/postgres] ping: %w", err)
	}
	log.Printf("[db/postgres] opened database")
	return &SQLiteStore{db: rdb, dialect: "postgres"}, nil
}
