// Per-component Mantine styles instead of the full styles.css, to ship only the
// CSS we use. Base files first, then the components rendered anywhere in the app
// plus their internal dependencies (e.g. Modal->Overlay/Paper/CloseButton,
// Select->Combobox/Input/Popover/ScrollArea/Pill). NOTE: if a component looks
// unstyled after a change, a CSS dependency is missing here.
import '@mantine/core/styles/baseline.css'
import '@mantine/core/styles/default-css-variables.css'
import '@mantine/core/styles/global.css'
// low-level / shared
import '@mantine/core/styles/UnstyledButton.css'
import '@mantine/core/styles/Paper.css'
import '@mantine/core/styles/Overlay.css'
import '@mantine/core/styles/CloseButton.css'
import '@mantine/core/styles/Input.css'
import '@mantine/core/styles/Combobox.css'
import '@mantine/core/styles/Popover.css'
import '@mantine/core/styles/ScrollArea.css'
import '@mantine/core/styles/Pill.css'
import '@mantine/core/styles/ModalBase.css'
// components used directly
import '@mantine/core/styles/Accordion.css'
import '@mantine/core/styles/Alert.css'
import '@mantine/core/styles/Button.css'
import '@mantine/core/styles/Card.css'
import '@mantine/core/styles/Center.css'
import '@mantine/core/styles/Container.css'
import '@mantine/core/styles/Group.css'
import '@mantine/core/styles/Image.css'
import '@mantine/core/styles/List.css'
import '@mantine/core/styles/Modal.css'
import '@mantine/core/styles/Text.css'
import '@mantine/core/styles/Title.css'
import type { AppProps } from 'next/app'
import { MantineProvider } from '@mantine/core'
import NoSsr from '@/components/NoSsr'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <NoSsr>
      <MantineProvider defaultColorScheme="auto">
        <Component {...pageProps} />
      </MantineProvider>
    </NoSsr>
  )
}
