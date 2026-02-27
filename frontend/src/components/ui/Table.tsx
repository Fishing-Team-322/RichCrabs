import { ReactNode } from 'react'

export const Table = ({ headers, children }: { headers: string[]; children: ReactNode }) => (
  <div className="ui-tableWrap">
    <table className="ui-table">
      <thead>
        <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
)
