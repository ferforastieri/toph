package push

import (
	"context"
	"log/slog"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"

	"github.com/ferforastieri/toph/internal/store"
)

// Service delivers Android push notifications through Firebase Cloud Messaging.
// It is intentionally optional: installations without Firebase credentials keep
// working and the in-app notification bell remains available.
type Service struct {
	store    *store.Store
	client   *messaging.Client
	project  string
	disabled bool
}

func New(st *store.Store, credentialsFile, projectID string) *Service {
	service := &Service{store: st, project: projectID, disabled: true}
	if credentialsFile == "" {
		return service
	}
	ctx := context.Background()
	app, err := firebase.NewApp(ctx, &firebase.Config{ProjectID: projectID}, option.WithCredentialsFile(credentialsFile))
	if err != nil {
		slog.Warn("firebase disabled", "error", err)
		return service
	}
	client, err := app.Messaging(ctx)
	if err != nil {
		slog.Warn("firebase messaging disabled", "error", err)
		return service
	}
	service.client = client
	service.disabled = false
	return service
}

func (s *Service) Enabled() bool {
	return s != nil && !s.disabled && s.client != nil
}

func (s *Service) Register(ctx context.Context, token, platform string) error {
	return s.store.RegisterPushToken(ctx, token, platform)
}

// NotifyAI sends a data-only message so the Android client can decide whether to
// render a system notification or update the in-app bell.
func (s *Service) NotifyAI(ctx context.Context) {
	if !s.Enabled() {
		return
	}
	tokens, err := s.store.ListPushTokens(ctx)
	if err != nil {
		slog.Warn("could not list push tokens", "error", err)
		return
	}
	if len(tokens) == 0 {
		return
	}
	message := &messaging.MulticastMessage{
		Tokens: tokens,
		Data: map[string]string{
			"type":  "ai.done",
			"title": "Resposta da IA",
			"body":  "A IA terminou de responder.",
		},
		Android: &messaging.AndroidConfig{
			Priority: "high",
		},
	}
	response, err := s.client.SendEachForMulticast(ctx, message)
	if err != nil {
		slog.Warn("could not send push notification", "error", err)
		return
	}
	for index, result := range response.Responses {
		if result.Success {
			continue
		}
		if messaging.IsUnregistered(result.Error) || messaging.IsRegistrationTokenNotRegistered(result.Error) {
			_ = s.store.DeletePushToken(ctx, tokens[index])
		}
	}
}
