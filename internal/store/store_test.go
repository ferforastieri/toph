package store

import (
	"context"
	"path/filepath"
	"testing"
)

func TestProjectsAndLayout(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	ctx := context.Background()

	user, err := st.CreateUser(ctx, "admin", "hash")
	if err != nil {
		t.Fatal(err)
	}
	project, err := st.CreateProject(ctx, Project{ID: "p1", Name: "Demo", Root: "/tmp/demo"})
	if err != nil {
		t.Fatal(err)
	}
	if project.Color == "" {
		t.Fatal("expected default project color")
	}
	if _, err := st.CreateProject(ctx, Project{ID: "p2", Name: "Other", Root: "/tmp/demo"}); err != ErrConflict {
		t.Fatalf("expected conflict for duplicate root, got %v", err)
	}
	projects, err := st.ListProjects(ctx)
	if err != nil || len(projects) != 1 {
		t.Fatalf("unexpected projects: %+v %v", projects, err)
	}
	layout, err := st.WorkspaceLayout(ctx, user.ID, project.ID)
	if err != nil || layout != "{}" {
		t.Fatalf("unexpected empty layout: %q %v", layout, err)
	}
	if err := st.SaveWorkspaceLayout(ctx, user.ID, project.ID, `{"tabs":[]}`); err != nil {
		t.Fatal(err)
	}
	layout, err = st.WorkspaceLayout(ctx, user.ID, project.ID)
	if err != nil || layout != `{"tabs":[]}` {
		t.Fatalf("unexpected layout: %q %v", layout, err)
	}
}
