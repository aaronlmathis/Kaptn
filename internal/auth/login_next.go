package auth

import (
    "encoding/base64"
    "net/http"
    "net/url"
    "os"
    "strings"
    "time"

    "github.com/gorilla/securecookie"
    "go.uber.org/zap"
)

// LoginNext holds a short-lived redirect hint for post-login navigation
type LoginNext struct {
    Path      string    `json:"p"`
    ExpiresAt time.Time `json:"exp"`
}

// LoginNextStore manages the login_next cookie using securecookie with shared keys
type LoginNextStore struct {
    sc     *securecookie.SecureCookie
    logger *zap.Logger
}

const (
    loginNextCookieName = "kaptn_login_next"
    loginNextTTL        = 10 * time.Minute
)

// NewLoginNextStore creates a new store from raw keys
func NewLoginNextStore(hashKey, blockKey []byte, logger *zap.Logger) (*LoginNextStore, error) {
    sc := securecookie.New(hashKey, blockKey)
    sc.MaxAge(int(loginNextTTL.Seconds()))
    return &LoginNextStore{sc: sc, logger: logger}, nil
}

// NewLoginNextStoreWithPaths loads keys similar to OIDC state (env -> files)
func NewLoginNextStoreWithPaths(logger *zap.Logger, hashKeyPath, blockKeyPath string) (*LoginNextStore, error) {
    // Reuse the same env vars as OIDC state for stateless multi-pod operation
    hashKeyStr := os.Getenv("OIDC_STATE_HASH_KEY")
    blockKeyStr := os.Getenv("OIDC_STATE_BLOCK_KEY")

    // Fallback to files if env is empty
    if hashKeyStr == "" && hashKeyPath != "" {
        if data, err := os.ReadFile(hashKeyPath); err == nil {
            hashKeyStr = string(data)
        }
    }
    if blockKeyStr == "" && blockKeyPath != "" {
        if data, err := os.ReadFile(blockKeyPath); err == nil {
            blockKeyStr = string(data)
        }
    }

    var hashKey, blockKey []byte
    var err error
    if hashKey, err = base64.StdEncoding.DecodeString(hashKeyStr); err != nil || len(hashKey) == 0 {
        hashKey = []byte(hashKeyStr)
    }
    if blockKey, err = base64.StdEncoding.DecodeString(blockKeyStr); err != nil || len(blockKey) == 0 {
        blockKey = []byte(blockKeyStr)
    }

    return NewLoginNextStore(hashKey, blockKey, logger)
}

// sanitizeRelativePath enforces a safe, relative path within the app
func sanitizeRelativePath(p string) string {
    if p == "" {
        return "/"
    }
    // If full URL, drop scheme/host and keep only path+query
    if u, err := url.Parse(p); err == nil && u.IsAbs() {
        p = u.EscapedPath()
        if u.RawQuery != "" {
            p += "?" + u.RawQuery
        }
    }

    // Must start with single slash and not with //
    if !strings.HasPrefix(p, "/") || strings.HasPrefix(p, "//") {
        return "/"
    }
    // Prevent attempts to escape
    if strings.HasPrefix(p, "/api/v1/auth") { // avoid bouncing back to auth endpoints
        return "/"
    }
    return p
}

// Set stores a short-lived, signed cookie with the intended relative path
func (s *LoginNextStore) Set(w http.ResponseWriter, rawPath string) error {
    next := &LoginNext{
        Path:      sanitizeRelativePath(rawPath),
        ExpiresAt: time.Now().Add(loginNextTTL),
    }
    encoded, err := s.sc.Encode(loginNextCookieName, next)
    if err != nil {
        return err
    }
    cookie := &http.Cookie{
        Name:     loginNextCookieName,
        Value:    encoded,
        HttpOnly: true,
        Secure:   true,
        SameSite: http.SameSiteLaxMode,
        Path:     "/",
        MaxAge:   int(loginNextTTL.Seconds()),
    }
    http.SetCookie(w, cookie)
    return nil
}

// GetAndClear returns the stored path if valid and clears the cookie
func (s *LoginNextStore) GetAndClear(w http.ResponseWriter, r *http.Request) (string, bool) {
    cookie, err := r.Cookie(loginNextCookieName)
    if err != nil {
        return "", false
    }
    var data LoginNext
    if err := s.sc.Decode(loginNextCookieName, cookie.Value, &data); err != nil {
        s.clear(w)
        return "", false
    }
    if time.Now().After(data.ExpiresAt) {
        s.clear(w)
        return "", false
    }
    s.clear(w)
    return sanitizeRelativePath(data.Path), true
}

func (s *LoginNextStore) clear(w http.ResponseWriter) {
    http.SetCookie(w, &http.Cookie{
        Name:     loginNextCookieName,
        Value:    "",
        HttpOnly: true,
        Secure:   true,
        SameSite: http.SameSiteLaxMode,
        Path:     "/",
        MaxAge:   -1,
    })
}

