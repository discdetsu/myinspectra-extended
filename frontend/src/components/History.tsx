import { useState } from "react";

interface HistoryRecord {
  id: string;
  filename: string;
  timestamp: string;
  status: "completed" | "failed" | "waiting";
  abnormality: {
    score: number | null;
    present: boolean;
  };
  tuberculosis: {
    score: number | null;
    present: boolean;
  };
  conditions: {
    lungOpacity: boolean;
    mass: boolean;
    nodule: boolean;
    pulmonaryEdema: boolean;
    atelectasis: boolean;
    cardiomegaly: boolean;
    pleuralEffusion: boolean;
    tuberculosis: boolean;
    pneumothorax: boolean;
  };
}

export default function History() {
  const [records] = useState<HistoryRecord[]>([
    {
      id: "1",
      filename: "chest-xray-001.jpg",
      timestamp: "2024-02-20 14:30:00",
      status: "completed",
      abnormality: {
        score: 94,
        present: true
      },
      tuberculosis: {
        score: 88,
        present: true
      },
      conditions: {
        lungOpacity: true,
        mass: true,
        nodule: true,
        pulmonaryEdema: false,
        atelectasis: false,
        cardiomegaly: false,
        pleuralEffusion: true,
        tuberculosis: true,
        pneumothorax: false
      }
    },
    {
      id: "2",
      filename: "chest-xray-002.jpg",
      timestamp: "2024-02-21 15:30:00",
      status: "completed",
      abnormality: {
        score: null,
        present: false
      },
      tuberculosis: {
        score: null,
        present: false
      },
      conditions: {
        lungOpacity: false,
        mass: false,
        nodule: false,
        pulmonaryEdema: false,
        atelectasis: false,
        cardiomegaly: false,
        pleuralEffusion: false,
        tuberculosis: false,
        pneumothorax: false
      }
    }
  ]);

  const renderConditionBadges = (conditions: HistoryRecord['conditions']) => {
    // Check if any condition is true
    const hasConditions = Object.values(conditions).some(value => value);
    
    if (!hasConditions) {
      return (
        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
          N/A
        </span>
      );
    }

    const badges = [];
    for (const [key, value] of Object.entries(conditions)) {
      if (value) {
        badges.push(
          <span
            key={key}
            className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10 mr-1 mb-1"
          >
            {key.replace(/([A-Z])/g, ' $1').trim()}
          </span>
        );
      }
    }
    return badges;
  };

  const renderAbnormalityBadge = (abnormality: { score: number | null; present: boolean }) => {
    if (!abnormality.present) {
      return (
        <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/10">
          Abnormality Low
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
        Abnormality {abnormality.score}%
      </span>
    );
  };

  const renderTuberculosisBadge = (tuberculosis: { score: number | null; present: boolean }) => {
    if (!tuberculosis.present) {
      return (
        <span className="ml-1 inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/10">
          Tuberculosis Low
        </span>
      );
    }
    return (
      <span className="ml-1 inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
        Tuberculosis {tuberculosis.score}%
      </span>
    );
  };

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h2 className="text-xl font-semibold text-gray-900">Analysis History</h2>
          <p className="mt-2 text-sm text-gray-700">
            A list of all previous chest X-ray analyses and their results.
          </p>
        </div>
      </div>
      
      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle">
            <table className="min-w-full divide-y divide-gray-300">
              <thead>
                <tr>
                  <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">
                    Filename
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                    Date
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                    Result
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                    Conditions
                  </th>
                  <th scope="col" className="relative py-3.5 pl-3 pr-4">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900">
                      {record.filename}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {record.timestamp}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm">
                      {renderAbnormalityBadge(record.abnormality)}
                      {renderTuberculosisBadge(record.tuberculosis)}
                    </td>
                    <td className="px-3 py-4 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {renderConditionBadges(record.conditions)}
                      </div>
                    </td>
                    <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium">
                      <button
                        onClick={() => {/* Add view details handler */}}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View<span className="sr-only">, {record.filename}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
