import { Component } from 'react';

// Catches render/runtime errors anywhere below it so a single bad screen shows
// a recoverable message instead of a blank white page.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="card">
          <h2>Something went wrong</h2>
          <p className="sub" style={{ marginBottom: 12 }}>
            {this.state.error.message || 'Unexpected error.'}
          </p>
          <button onClick={this.reset}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
