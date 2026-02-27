import type { PropsWithChildren, ReactElement } from 'react'
import { Provider } from 'react-redux'
import { ThemeProvider } from 'styled-components'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotificationProvider from '../app/providers/NotificationProvider'
import { theme } from '../theme/theme'
import { createAppStore, type AppStore } from '../store/store'

interface RenderOptions {
  route?: string
  store?: AppStore
}

export const renderWithProviders = (
  ui: ReactElement,
  { route = '/', store = createAppStore() }: RenderOptions = {},
) => {
  const Wrapper = ({ children }: PropsWithChildren) => (
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={[route]}>
          <NotificationProvider>{children}</NotificationProvider>
        </MemoryRouter>
      </ThemeProvider>
    </Provider>
  )

  return {
    store,
    ...render(ui, { wrapper: Wrapper }),
  }
}
