import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || '應用程式發生非預期錯誤' };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#fcf9f8] text-[#1b1c1c] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-[#e0d8d3] rounded-lg p-8 shadow-warm space-y-4">
            <h2 className="text-xl font-serif text-[#70472d]">頁面發生異常，請重新整理</h2>
            <p className="text-sm text-[#51443d] break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-lg bg-[#8c5e43] text-white text-sm font-medium hover:bg-[#73594c] transition-colors cursor-pointer"
            >
              重新載入畫面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
