package server

import "testing"

func TestNewerRelease(t *testing.T) {
	cases := []struct {
		latest  string
		current string
		want    bool
	}{
		{"v0.8.11", "0.8.10", true},
		{"v0.9.0", "0.8.10", true},
		{"v1.0.0", "0.9.9", true},
		{"v0.8.10", "0.8.10", false},
		{"v0.8.9", "0.8.10", false},
		{"dev", "0.8.10", false},
		{"v0.8.10", "dev", false},
	}
	for _, test := range cases {
		if got := newerRelease(test.latest, test.current); got != test.want {
			t.Errorf("newerRelease(%q, %q) = %v, want %v", test.latest, test.current, got, test.want)
		}
	}
}

func TestParseReleaseVersion(t *testing.T) {
	if _, ok := parseReleaseVersion("v1.2.3"); !ok {
		t.Fatal("expected v1.2.3 to be valid")
	}
	for _, value := range []string{"1.2", "v1.2.3-rc1", "latest", "v1.2.x"} {
		if _, ok := parseReleaseVersion(value); ok {
			t.Errorf("expected %q to be invalid", value)
		}
	}
}
