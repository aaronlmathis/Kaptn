package exec

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/remotecommand"
)

// ExecManager manages pod exec sessions
type ExecManager struct {
	logger     *zap.Logger
	kubeClient kubernetes.Interface
	restConfig *rest.Config
	sessions   map[string]*ExecSession
	mutex      sync.RWMutex
	upgrader   websocket.Upgrader
}

// ExecSession represents an active exec session
type ExecSession struct {
	ID        string
	namespace string
	podName   string
	container string
	command   []string
	conn      *websocket.Conn
	ctx       context.Context
	cancel    context.CancelFunc
	stdin     *websocketReader
	stdout    *websocketWriter
	stderr    *websocketWriter
}

// ExecRequest represents a request to start an exec session
type ExecRequest struct {
	Namespace string   `json:"namespace"`
	Pod       string   `json:"pod"`
	Container string   `json:"container"`
	Command   []string `json:"command"`
	TTY       bool     `json:"tty"`
}

// Message represents a WebSocket message for terminal communication
type Message struct {
	Type string `json:"type"` // "stdin", "stdout", "stderr", "resize", "error"
	Data string `json:"data"`
	Cols int    `json:"cols,omitempty"`
	Rows int    `json:"rows,omitempty"`
}

// NewExecManager creates a new exec manager
func NewExecManager(logger *zap.Logger, kubeClient kubernetes.Interface, restConfig *rest.Config) *ExecManager {
	return &ExecManager{
		logger:     logger,
		kubeClient: kubeClient,
		restConfig: restConfig,
		sessions:   make(map[string]*ExecSession),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true // Allow all origins for now - should be configurable
			},
		},
	}
}

// StartExecSession starts a new exec session via WebSocket
func (em *ExecManager) StartExecSession(w http.ResponseWriter, r *http.Request, sessionID string, req ExecRequest) error {
	// Upgrade HTTP connection to WebSocket
	conn, err := em.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return fmt.Errorf("failed to upgrade connection: %w", err)
	}

	ctx, cancel := context.WithCancel(r.Context())

	session := &ExecSession{
		ID:        sessionID,
		namespace: req.Namespace,
		podName:   req.Pod,
		container: req.Container,
		command:   req.Command,
		conn:      conn,
		ctx:       ctx,
		cancel:    cancel,
		stdin:     newWebsocketReader(conn),
		stdout:    newWebsocketWriter(conn, "stdout"),
		stderr:    newWebsocketWriter(conn, "stderr"),
	}

	em.mutex.Lock()
	em.sessions[sessionID] = session
	em.mutex.Unlock()

	em.logger.Info("Started exec session",
		zap.String("sessionID", sessionID),
		zap.String("namespace", req.Namespace),
		zap.String("pod", req.Pod),
		zap.String("container", req.Container),
		zap.Strings("command", req.Command))

	// Start the exec session
	go em.handleExecSession(session, req.TTY)

	return nil
}

// StopExecSession stops an active exec session
func (em *ExecManager) StopExecSession(sessionID string) {
	em.mutex.Lock()
	defer em.mutex.Unlock()

	if session, exists := em.sessions[sessionID]; exists {
		session.cancel()
		session.conn.Close()
		delete(em.sessions, sessionID)
		em.logger.Info("Stopped exec session", zap.String("sessionID", sessionID))
	}
}

// handleExecSession manages the exec session lifecycle
func (em *ExecManager) handleExecSession(session *ExecSession, tty bool) {
	defer func() {
		session.cancel()
		session.conn.Close()
		em.mutex.Lock()
		delete(em.sessions, session.ID)
		em.mutex.Unlock()
	}()

	// Create exec request
	execReq := em.kubeClient.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(session.podName).
		Namespace(session.namespace).
		SubResource("exec").
		VersionedParams(&v1.PodExecOptions{
			Container: session.container,
			Command:   session.command,
			Stdin:     true,
			Stdout:    true,
			Stderr:    !tty, // stderr is not used in TTY mode
			TTY:       tty,
		}, scheme.ParameterCodec)

	// Create executor
	executor, err := remotecommand.NewSPDYExecutor(em.restConfig, "POST", execReq.URL())
	if err != nil {
		em.sendError(session.conn, fmt.Sprintf("Failed to create executor: %v", err))
		return
	}

	// Start reading from WebSocket for stdin
	go session.stdin.start(session.ctx)

	// Execute the command
	err = executor.StreamWithContext(session.ctx, remotecommand.StreamOptions{
		Stdin:  session.stdin,
		Stdout: session.stdout,
		Stderr: session.stderr,
		Tty:    tty,
	})

	if err != nil {
		em.sendError(session.conn, fmt.Sprintf("Exec failed: %v", err))
		return
	}

	em.logger.Info("Exec session completed", zap.String("sessionID", session.ID))
}

// sendError sends an error message via WebSocket
func (em *ExecManager) sendError(conn *websocket.Conn, message string) {
	msg := Message{
		Type: "error",
		Data: message,
	}
	conn.WriteJSON(msg)
}

// websocketReader implements io.Reader for WebSocket stdin
type websocketReader struct {
	conn   *websocket.Conn
	buffer []byte
	mutex  sync.Mutex
}

func newWebsocketReader(conn *websocket.Conn) *websocketReader {
	return &websocketReader{
		conn:   conn,
		buffer: make([]byte, 0),
	}
}

func (r *websocketReader) Read(p []byte) (n int, err error) {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	// If buffer is empty, read from WebSocket
	for len(r.buffer) == 0 {
		var msg Message
		err := r.conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				return 0, io.EOF
			}
			return 0, err
		}

		if msg.Type == "stdin" {
			r.buffer = append(r.buffer, []byte(msg.Data)...)
		}
		// Ignore other message types in the reader
	}

	// Copy from buffer to p
	n = copy(p, r.buffer)
	r.buffer = r.buffer[n:]
	return n, nil
}

func (r *websocketReader) start(ctx context.Context) {
	// This method ensures the reader is actively processing WebSocket messages
	// The actual reading happens in the Read method
	<-ctx.Done()
}

// websocketWriter implements io.Writer for WebSocket stdout/stderr
type websocketWriter struct {
	conn     *websocket.Conn
	msgType  string
	mutex    sync.Mutex
}

func newWebsocketWriter(conn *websocket.Conn, msgType string) *websocketWriter {
	return &websocketWriter{
		conn:    conn,
		msgType: msgType,
	}
}

func (w *websocketWriter) Write(p []byte) (n int, err error) {
	w.mutex.Lock()
	defer w.mutex.Unlock()

	msg := Message{
		Type: w.msgType,
		Data: string(p),
	}

	err = w.conn.WriteJSON(msg)
	if err != nil {
		return 0, err
	}

	return len(p), nil
}

// ResizeSession handles terminal resize for a session
func (em *ExecManager) ResizeSession(sessionID string, cols, rows int) error {
	em.mutex.RLock()
	session, exists := em.sessions[sessionID]
	em.mutex.RUnlock()

	if !exists {
		return fmt.Errorf("session %s not found", sessionID)
	}

	// Send resize message (implementation depends on how terminal resizing is handled)
	msg := Message{
		Type: "resize",
		Cols: cols,
		Rows: rows,
	}

	return session.conn.WriteJSON(msg)
}
